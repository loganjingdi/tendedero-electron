'use strict';

const fs = require('fs');
const path = require('path');
const { clipboard } = require('electron');
const {
  CLIPBOARD_POLL_MS, MAX_CLIPBOARD_BYTES,
} = require('../shared/constants');

/**
 * 挂上复制到剪贴板的图片（对照原版 ClipboardWatcher）—— 唯一的截图来源。
 * PrtScn、Win+Shift+S 等截图方式都把图片放进剪贴板，轮询发现新图后保存为
 * PNG 到应用自己的 captures 目录，再挂上绳子。
 * 剪贴板没有变更通知，所以每 500ms 查一次；只有内容确实变了才算数。
 */
function createClipboardWatcher({ state, onImage }) {
  const capturesDir = state.capturesDir;
  let previousClipboardHash = null; // 剪贴板当前内容的哈希（没变就跳过）

  function stamp() {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    // 对照原版命名：Clipboard yyyy-MM-dd at HH.mm.ss.png（Windows 文件名里不能用冒号，用点）
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  }

  function save(png) {
    fs.mkdirSync(capturesDir, { recursive: true });
    let filePath = path.join(capturesDir, `Clipboard ${stamp()}.png`);
    let n = 2;
    while (fs.existsSync(filePath)) {
      filePath = path.join(capturesDir, `Clipboard ${stamp()} ${n}.png`);
      n += 1;
    }
    fs.writeFileSync(filePath, png);
    return filePath;
  }

  function start() {
    // 启动时剪贴板上已有的内容是旧闻，登记为基线，不挂
    try {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const buf = img.toPNG();
        if (buf.length > 0 && buf.length <= MAX_CLIPBOARD_BYTES) {
          previousClipboardHash = state.sha256(buf);
        }
      }
    } catch {
      // 剪贴板可能正被其他进程占用，忽略
    }

    setInterval(() => {
      try {
        const img = clipboard.readImage(); // 文本/文件复制出来是空图，自动忽略
        if (img.isEmpty()) return;
        const buf = img.toPNG();
        if (buf.length === 0 || buf.length > MAX_CLIPBOARD_BYTES) return;
        const hash = state.sha256(buf);
        if (hash === previousClipboardHash) return; // (c) 剪贴板内容没变
        previousClipboardHash = hash;
        if (hash === state.lastCopiedHash) return; // (a) 应用自己点击复制出去的
        if (state.knownHashes.has(hash)) return; // (b) 已经挂在绳子上
        const filePath = save(buf);
        onImage(filePath, hash);
      } catch (err) {
        // 剪贴板可能被瞬时锁定，下一次轮询再看
      }
    }, CLIPBOARD_POLL_MS);
  }

  return { start };
}

module.exports = { createClipboardWatcher };
