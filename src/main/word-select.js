'use strict';

const { uIOhook } = require('uiohook-napi');
const { WORD_SELECT_DELAY_MS } = require('../shared/constants');

/**
 * 划词翻译的选区检测：全局鼠标钩子监听按下/松开，记录用户拖出的选区矩形，
 * 松开 WORD_SELECT_DELAY_MS（0.5s）后自动触发取词弹窗；期间任何点击都会取消
 * （与大多数应用"点击即取消选区"的行为一致）。
 * 坐标说明：uiohook 给出的是物理像素坐标（Windows GetCursorPos），
 * 与 Electron 的 DIP 坐标的换算由调用方（main.js）处理。
 */
function createWordSelect({ isEnabled, isInsideAppWindow, onTrigger, onOutsideClick }) {
  let dragStart = null;
  let pendingTimer = null;

  const MIN_DRAG = 5; // 小于这个位移不算选区（普通点击）
  const MAX_AREA = 9_000_000; // 超过（接近全屏）的区域不是取词

  const norm = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  uIOhook.on('mousedown', (e) => {
    if (!isEnabled()) return;
    // 任何按下都取消待触发的弹窗（点击即放弃选区，与系统行为一致）
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (e.button === 1) dragStart = { x: e.x, y: e.y };
    // 点在我们窗口之外的地方：关掉取词弹窗（类似 tooltip 行为）
    if (!isInsideAppWindow({ x: e.x, y: e.y })) onOutsideClick();
  });

  uIOhook.on('mouseup', (e) => {
    if (!isEnabled() || e.button !== 1 || !dragStart) return;
    const rect = norm(dragStart, { x: e.x, y: e.y });
    dragStart = null;
    if (rect.w < MIN_DRAG && rect.h < MIN_DRAG) return; // 是点击不是划选
    if (isInsideAppWindow({ x: rect.x, y: rect.y })) return; // 在自己窗口里拖的（如拖拽照片）
    if (rect.w * rect.h > MAX_AREA) return; // 全屏级区域
    // 松开后稍等片刻再弹出：留出用户继续调整选区或点击取消的时间
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      onTrigger(rect);
    }, WORD_SELECT_DELAY_MS);
  });

  function setActive(on) {
    try {
      if (on) uIOhook.start();
      else uIOhook.stop();
    } catch (err) {
      console.error('uiohook 切换失败:', err.message);
    }
  }

  return { setActive };
}

module.exports = { createWordSelect };
