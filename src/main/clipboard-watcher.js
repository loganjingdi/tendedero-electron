'use strict';

const fs = require('fs');
const path = require('path');
const { clipboard, nativeImage } = require('electron');
const {
  CLIPBOARD_POLL_MS, MAX_CLIPBOARD_BYTES,
} = require('../shared/constants');

/**
 * 挂上复制到剪贴板的图片（对照原版 ClipboardWatcher）—— 唯一的截图来源。
 * PrtScn、Win+Shift+S 等截图方式都把图片放进剪贴板，轮询发现新图后保存为
 * PNG 到应用自己的 captures 目录，再挂上绳子。
 * 剪贴板没有变更通知，所以每 500ms 查一次；只有内容确实变了才算数。
 * Electron 45 起 clipboard 改为异步 API：read() 返回 ClipboardItem[]，
 * 图片以 image/png（或 image/bmp 等）MIME 类型暴露，getType 得到 Blob。
 */
function createClipboardWatcher({ state, onImage }) {
  const capturesDir = state.capturesDir;
  let previousClipboardHash = null; // 剪贴板当前内容的哈希（没变就跳过）
  let busy = false; // 上一轮异步读取还没结束就跳过本轮，避免轮询重叠

  /** 读取剪贴板上的图片，返回归一化后的 PNG 字节；没有图片/被占用返回 null */
  async function readClipboardImage() {
    try {
      const items = await clipboard.read();
      for (const item of items) {
        const mime = ['image/png', 'image/bmp'].find((t) => item.types.includes(t))
          || item.types.find((t) => t.startsWith('image/'));
        if (!mime) continue;
        const blob = await item.getType(mime);
        const buf = Buffer.from(await blob.arrayBuffer());
        if (mime === 'image/png') {
          // 原始 PNG 字节直接用：解码再编码可能改变字节，破坏"自己复制的内容"去重
          return buf.length > 0 && buf.length <= MAX_CLIPBOARD_BYTES ? buf : null;
        }
        const img = nativeImage.createFromBuffer(buf); // BMP 等其他格式统一转 PNG
        if (img.isEmpty()) return null;
        const png = img.toPNG();
        return png.length > 0 && png.length <= MAX_CLIPBOARD_BYTES ? png : null;
      }
      return null;
    } catch {
      // 剪贴板可能正被其他进程占用，忽略，下一轮再看
      return null;
    }
  }

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

  async function start() {
    // 启动时剪贴板上已有的内容是旧闻，登记为基线，不挂
    const baseline = await readClipboardImage();
    if (baseline) previousClipboardHash = state.sha256(baseline);

    setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const png = await readClipboardImage();
        if (!png) return;
        const hash = state.sha256(png);
        if (hash === previousClipboardHash) return; // (c) 剪贴板内容没变
        previousClipboardHash = hash;
        if (hash === state.lastCopiedHash) return; // (a) 应用自己点击复制出去的
        if (state.knownHashes.has(hash)) return; // (b) 已经挂在绳子上
        const filePath = save(png);
        onImage(filePath, hash);
      } catch (err) {
        // 剪贴板可能被瞬时锁定，下一次轮询再看
      } finally {
        busy = false;
      }
    }, CLIPBOARD_POLL_MS);
  }

  return { start };
}

module.exports = { createClipboardWatcher };
