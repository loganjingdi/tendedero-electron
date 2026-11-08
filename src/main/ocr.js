'use strict';

const fs = require('fs');
const path = require('path');
const { app, desktopCapturer, screen } = require('electron');

/**
 * 选区截图 + OCR 识别（tesseract.js，中英混合，语言包在 resources/tessdata 离线加载）。
 * rect 为物理像素坐标 { x, y, w, h }。
 */

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = require('tesseract.js');
      const worker = await createWorker('chi_sim+eng', 1, {
        langPath: path.join(app.getAppPath(), 'resources', 'tessdata'),
        cachePath: path.join(app.getPath('userData'), 'tesscache'),
        gzip: false, // 语言包是解压后的 .traineddata；默认 true 找不到 .gz 会尝试联网下载（国内会挂起）
      });
      // 选区通常是一块连续文字，SINGLE_BLOCK 效果好于默认的自动分栏
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return worker;
    })();
  }
  return workerPromise;
}

/** 截取 rect（物理像素）所在的显示器画面，返回裁切后的 NativeImage */
async function captureRegion(rect) {
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };

  // 找到选区中心所在的显示器（把 DIP bounds 换算成物理像素再比较）
  const displays = screen.getAllDisplays();
  let display = displays.find((d) => {
    const sf = d.scaleFactor;
    return (
      center.x >= d.bounds.x * sf && center.x < (d.bounds.x + d.size.width) * sf &&
      center.y >= d.bounds.y * sf && center.y < (d.bounds.y + d.size.height) * sf
    );
  }) || screen.getPrimaryDisplay();
  const sf = display.scaleFactor;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * sf),
      height: Math.round(display.size.height * sf),
    },
  });
  const src = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  const img = src.thumbnail;

  // thumbnailSize 只是建议值：Windows 上通常按物理分辨率返回，但个别环境
  // 可能给 DIP 尺寸。以实际返回尺寸为准换算裁切坐标。
  const got = img.getSize();
  const physical = got.width === Math.round(display.size.width * sf);
  const factor = physical ? 1 : sf;
  const cropRect = {
    x: Math.round((rect.x - display.bounds.x * sf) / factor),
    y: Math.round((rect.y - display.bounds.y * sf) / factor),
    width: Math.round(rect.w / factor),
    height: Math.round(rect.h / factor),
  };
  // 裁切边界兜底（多显示器负坐标等极端情况）
  cropRect.x = Math.max(0, Math.min(cropRect.x, Math.max(0, got.width - 1)));
  cropRect.y = Math.max(0, Math.min(cropRect.y, Math.max(0, got.height - 1)));
  cropRect.width = Math.max(1, Math.min(cropRect.width, got.width - cropRect.x));
  cropRect.height = Math.max(1, Math.min(cropRect.height, got.height - cropRect.y));

  let cropped = img.crop(cropRect);
  if (cropped.getSize().width > 1600) cropped = cropped.resize({ width: 1600 }); // 太大的图降采样提速
  return cropped;
}

/** 截图并识别，返回去空白后的文字（识别失败返回空串） */
async function recognize(rect) {
  const img = await captureRegion(rect);
  const tmpPath = path.join(app.getPath('userData'), 'ocr-temp.png');
  fs.writeFileSync(tmpPath, img.toPNG());
  const worker = await getWorker();
  const { data } = await worker.recognize(tmpPath);
  return (data.text || '').replace(/\s+/g, ' ').trim();
}

module.exports = { recognize };
