'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, nativeImage, shell } = require('electron');
const {
  SIZES, MAX_LOOSE, THUMB_WIDTH, SAVE_DEBOUNCE_MS,
} = require('../shared/constants');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rand = (min, max) => min + Math.random() * (max - min);

/**
 * 绳子上挂了什么、可以做什么。主进程独占所有状态，渲染进程是它的纯视图。
 * 文件本身从不移动：绳子只是指向 captures 目录里文件的视图（对照原版 Line.swift）。
 */
function createState({ onChanged }) {
  const stateFile = path.join(app.getPath('userData'), 'line-state.json');
  const capturesDir = path.join(app.getPath('userData'), 'captures');

  /** @type {Array<{id, path, pinned, addedAt, hash, thumb, dataURL, tilt}>} */
  let photos = [];
  let size = 'medium';
  let wordSelectEnabled = true; // 划词翻译开关，默认开
  const knownHashes = new Set(); // 绳上（或曾由本应用写入）图片的哈希，用于剪贴板去重
  let lastCopiedHash = null; // 应用自己点击复制到剪贴板的最后一张，防自触发
  let saveTimer = null;

  const isInCaptures = (p) => path.resolve(p).startsWith(capturesDir + path.sep);

  function hashFile(filePath) {
    try {
      return sha256(fs.readFileSync(filePath));
    } catch {
      return null;
    }
  }

  function makePhoto(filePath, hash, extra = {}) {
    // 注意：不能用 nativeImage.createThumbnailFromPath —— Electron 33 在 Windows 上
    // 对该 API 的路径参数有已知 bug（实测抛异常/永久挂死，主进程事件循环被卡住）。
    // 改用 createFromPath + resize（实测中文路径 21ms 完成）。
    const full = nativeImage.createFromPath(filePath);
    if (full.isEmpty()) return null;
    const thumb = full.resize({ width: THUMB_WIDTH });
    if (thumb.isEmpty()) return null;
    const dataURL = thumb.toDataURL();
    if (!dataURL) return null;
    return {
      id: crypto.randomUUID(),
      path: filePath,
      pinned: false,
      addedAt: Date.now(),
      hash,
      thumb, // 缩略图 NativeImage，供 startDrag 图标复用，不序列化
      dataURL,
      tilt: rand(-2.5, 2.5), // 每张照片都挂得有点歪，像真的晾衣绳
      ...extra,
    };
  }

  function sortOrder() {
    // 固定的在前（各自按挂上时间），非固定的随后
    const pinned = photos.filter((p) => p.pinned);
    const loose = photos.filter((p) => !p.pinned);
    photos = [...pinned, ...loose];
  }

  function broadcast() {
    onChanged(payload());
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = {
        version: 1,
        size,
        wordSelectEnabled,
        photos: photos.map((p) => ({ id: p.id, path: p.path, pinned: p.pinned, addedAt: p.addedAt })),
      };
      try {
        fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('保存状态失败:', err.message);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  /** 启动时恢复：文件已经不存在的自动落下（prune），并重建哈希与缩略图 */
  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (raw.size && SIZES[raw.size]) size = raw.size;
      if (typeof raw.wordSelectEnabled === 'boolean') wordSelectEnabled = raw.wordSelectEnabled;
      for (const entry of raw.photos || []) {
        if (!fs.existsSync(entry.path)) continue; // prune
        const hash = hashFile(entry.path);
        if (!hash) continue;
        const photo = makePhoto(entry.path, hash, {
          pinned: !!entry.pinned,
          addedAt: entry.addedAt || Date.now(),
        });
        if (!photo) continue;
        knownHashes.add(hash);
        photos.push(photo);
      }
    } catch {
      // 首次运行或文件损坏：从空绳开始
    }
    sortOrder();
  }

  function get(id) {
    return photos.find((p) => p.id === id);
  }

  /** 新照片挂上绳子；满员时最老的非固定照片自动落下（文件保留在 captures 目录） */
  function addPhoto(filePath, hash) {
    if (!hash) hash = hashFile(filePath);
    if (!hash) return null;
    const photo = makePhoto(filePath, hash);
    if (!photo) return null;
    photos.push(photo);
    knownHashes.add(hash);
    const loose = photos.filter((p) => !p.pinned);
    if (loose.length > MAX_LOOSE) {
      const oldest = loose[0];
      photos.splice(photos.indexOf(oldest), 1);
    }
    sortOrder();
    broadcast();
    save();
    return photo.id;
  }

  /** X 按钮 / Delete 键：进回收站并离绳（所有文件都是本应用写入的） */
  function removePhoto(id, { trash = true } = {}) {
    const idx = photos.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const photo = photos[idx];
    if (trash && isInCaptures(photo.path)) {
      try {
        shell.trashItem(photo.path);
      } catch (err) {
        console.error('移入回收站失败，改为直接删除:', err.message);
        try {
          fs.unlinkSync(photo.path);
        } catch (err2) {
          console.error('删除失败:', err2.message);
        }
      }
    }
    photos.splice(idx, 1);
    knownHashes.delete(photo.hash); // 拿下来的照片再次复制时允许重新挂上
    broadcast();
    save();
  }

  function togglePin(id) {
    const photo = get(id);
    if (!photo) return;
    photo.pinned = !photo.pinned;
    sortOrder();
    broadcast();
    save();
  }

  /** 清空：只清非固定（进回收站，显式用户操作） */
  function clear() {
    for (const photo of [...photos].filter((p) => !p.pinned)) {
      removePhoto(photo.id, { trash: true });
    }
  }

  function setSize(value) {
    if (!SIZES[value] || value === size) return;
    size = value;
    broadcast();
    save();
  }

  function setLastCopiedHash(hash) {
    lastCopiedHash = hash;
  }

  function setWordSelectEnabled(value) {
    wordSelectEnabled = !!value;
    save();
  }

  function payload() {
    return {
      photos: photos.map((p) => ({
        id: p.id, path: p.path, pinned: p.pinned, addedAt: p.addedAt,
        thumb: p.dataURL, tilt: p.tilt,
      })),
      size,
      scale: SIZES[size],
      cardW: Math.round(150 * SIZES[size]),
    };
  }

  return {
    load,
    get,
    addPhoto,
    removePhoto,
    togglePin,
    clear,
    setSize,
    setLastCopiedHash,
    setWordSelectEnabled,
    payload,
    knownHashes,
    get capturesDir() { return capturesDir; },
    get size() { return size; },
    get wordSelectEnabled() { return wordSelectEnabled; },
    get lastCopiedHash() { return lastCopiedHash; },
    hashFile,
    sha256,
  };
}

module.exports = { createState };
