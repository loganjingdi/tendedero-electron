'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { IPC, WORD_POPUP_TIMEOUT_MS } = require('../shared/constants');

const POPUP_WIDTH = 320;
const POPUP_HEIGHT = 168;

/**
 * 取词结果弹窗：出现在光标附近的小菜单，显示识别出的文字 + 「翻译」「复制文本」。
 * 不抢焦点（focusable: false + showInactive），不会打断正在取词的应用——
 * 抢焦点会让 UIA 读到弹窗自己而不是用户的选区。
 * 关闭方式：点弹窗外任意处（uiohook 检测）、点按钮、15 秒无人操作自动关。
 * 翻译动作目前是占位。
 */
function createWordPopup() {
  let win = null;
  let autoHideTimer = null;

  function ensure() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false, // 不激活、不抢焦点
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // 与主窗口一致：preload 需要 require 本地 constants
        backgroundThrottling: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(path.join(__dirname, '..', 'renderer', 'popup.html'));
    return win;
  }

  /** 只推送状态（窗口位置不变），如「翻译功能待接入」提示 */
  function sendState(state) {
    const w = ensure();
    w.webContents.send(IPC.WORD_RESULT, state);
  }

  /**
   * 在 pointDip（DIP 坐标）旁显示弹窗并推送状态。
   * state: { phase: 'loading' } | { phase: 'result', text } | { phase: 'note', text }
   */
  function showAt(pointDip, state) {
    const w = ensure();
    sendState(state); // 先推状态再显示，避免闪一帧旧内容
    const display = screen.getDisplayNearestPoint(pointDip);
    const wa = display.workArea;
    const x = Math.max(wa.x + 8, Math.min(pointDip.x + 12, wa.x + wa.width - POPUP_WIDTH - 8));
    const y = Math.max(wa.y + 8, Math.min(pointDip.y + 12, wa.y + wa.height - POPUP_HEIGHT - 8));
    w.setBounds({ x, y, width: POPUP_WIDTH, height: POPUP_HEIGHT });
    w.showInactive(); // 不激活窗口
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(hide, WORD_POPUP_TIMEOUT_MS);
  }

  function hide() {
    clearTimeout(autoHideTimer);
    if (win && !win.isDestroyed()) win.hide();
  }

  /** pointDip 是否落在弹窗内（用于判断右键是否点在自己窗口上） */
  function containsDip(p) {
    if (!win || win.isDestroyed() || !win.isVisible()) return false;
    const b = win.getBounds();
    return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  }

  return { showAt, sendState, hide, containsDip };
}

module.exports = { createWordPopup };
