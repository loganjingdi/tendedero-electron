'use strict';

// 托盘图标：一个挂在绳子上的小照片夹，32x32。
// 用纯 Node（zlib + 手写 PNG 块）在内存里生成，仓库里不需要任何二进制资源文件。

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  // 每行前置一个 filter 字节（0 = None）
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIconPNG() {
  const S = 32;
  const px = Buffer.alloc(S * S * 4); // 全透明
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  // 绳子：轻微垂坠的抛物线
  for (let x = 0; x < S; x++) {
    const y = Math.round(3 + 4 * 1.5 * (x / (S - 1)) * (1 - x / (S - 1)));
    set(x, y, 150, 150, 152, 255);
    set(x, y + 1, 150, 150, 152, 70);
  }

  // 夹子：银色渐变竖条 + 深色槽口
  for (let y = 5; y <= 12; y++) {
    const t = (y - 5) / 7;
    const g = Math.round(235 - 70 * t);
    for (let x = 14; x <= 17; x++) set(x, y, g, g, g, 255);
  }
  set(15, 8, 70, 70, 72, 255);
  set(16, 8, 70, 70, 72, 255);

  // 卡片：白色圆角矩形（玻璃框），左上角留一点画面
  for (let y = 13; y <= 28; y++) {
    for (let x = 8; x <= 23; x++) {
      const dx = Math.min(x - 8, 23 - x);
      const dy = Math.min(y - 13, 28 - y);
      if (dx === 0 && dy === 0) continue; // 切圆角
      set(x, y, 250, 250, 252, 255);
    }
  }
  for (let y = 15; y <= 26; y++) {
    for (let x = 10; x <= 21; x++) {
      const dx = Math.min(x - 10, 21 - x);
      const dy = Math.min(y - 15, 26 - y);
      if (dx === 0 && dy === 0) continue;
      set(x, y, 140, 180, 220, 255); // 画面：一小片蓝
    }
  }

  return encodePNG(S, S, px);
}

module.exports = { makeIconPNG };
