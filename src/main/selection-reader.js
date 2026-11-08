'use strict';

const SelectionHook = require('selection-hook');

/**
 * 划词取词：selection-hook 原生模块一次调用覆盖
 * UIA → Accessibility → 剪贴板（模拟 Ctrl+C 并恢复原内容）三级策略，
 * 与 pot 的 selection crate 在 Windows 上的取词思路一致。
 * 被动模式：不监听全局选区事件，只在 word-select.js 的鼠标钩子触发时
 * 主动读当前选区。惰性初始化：第一次取词时才启动原生钩子。
 * 读不到返回空串，由调用方（main.js）回退截图 OCR。
 */

let hook = null;

/** 启动原生钩子（被动模式 + 剪贴板兜底），失败置空回退 OCR */
function init() {
  try {
    hook = new SelectionHook();
    const ok = hook.start({ selectionPassiveMode: true, enableClipboard: true });
    if (!ok) {
      console.error('selection-hook 启动失败');
      hook = null;
    }
  } catch (err) {
    console.error('selection-hook 初始化失败:', err.message);
    hook = null;
  }
}

/** 同步读取当前选中文本；失败/读不到返回空串 */
function readSelectedText() {
  if (!hook) init();
  if (!hook) return '';
  try {
    const s = hook.getCurrentSelection();
    if (s && s.text && s.text.trim()) return s.text.trim();
  } catch (err) {
    console.error('selection-hook 读取失败:', err.message);
  }
  return '';
}

module.exports = { readSelectedText };
