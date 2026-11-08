'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { IPC, WINDOW_HEIGHT } = require('../shared/constants');

/**
 * 屏幕顶部的透明条带：浮在一切之上、从不抢焦点、除了照片所在处点击全部穿透。
 * 窗口永远停留在最终位置（主显示器顶部，高度 WINDOW_HEIGHT），揭示/收起只是
 * 渲染层 CSS transform，主进程从不移动窗口 —— setBounds 动画又卡又和透明窗打架。
 */
function createLineWindow({ isDev = false }) {
  const primary = screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.size.width,
    height: WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000', // 防启动白闪
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false, // 透明窗开阴影会出现矩形残影
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true, // 点击卡片后 Delete 键可用（代价是点击会抢焦点，v1 接受）
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require 本地 shared/constants.js；隔离仍由 contextIsolation 保证
      backgroundThrottling: false, // 否则窗口藏起时 rAF/动画被 Chromium 节流冻结
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // 点击穿透：常态忽略鼠标，但 forward 保证穿透时渲染器仍能收到 mousemove，
  // 从而检测悬停；光标悬停在可交互元素上时渲染器通知主进程解除忽略。
  let interactive = false;
  win.setIgnoreMouseEvents(true, { forward: true });

  function setInteractive(value) {
    if (interactive === value) return;
    interactive = value;
    win.setIgnoreMouseEvents(!value, { forward: true });
  }

  /** 指针快速移出窗口、渲染器漏掉 leave 时的兜底：由 cursor.js 调用 */
  function forceResetInteractive() {
    if (!interactive) return;
    interactive = false;
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.send(IPC.POINTER_INTERACTIVE_RESET);
  }

  function sendVisibility(revealed) {
    win.webContents.send(IPC.LINE_VISIBILITY, revealed);
  }

  function broadcast(payload) {
    win.webContents.send(IPC.LINE_CHANGED, payload);
  }

  function reposition() {
    const p = screen.getPrimaryDisplay();
    const b = win.getBounds();
    const target = {
      x: p.bounds.x,
      y: p.bounds.y,
      width: p.size.width,
      height: WINDOW_HEIGHT,
    };
    if (b.x !== target.x || b.y !== target.y || b.width !== target.width || b.height !== target.height) {
      win.setBounds(target);
    }
  }

  // 显示器变化（含任务栏移动、DPI 缩放改变）时重新定位
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);

  return {
    win,
    webContents: win.webContents,
    getBounds: () => win.getBounds(),
    getPrimaryId: () => screen.getPrimaryDisplay().id,
    setInteractive,
    isInteractive: () => interactive,
    forceResetInteractive,
    sendVisibility,
    broadcast,
  };
}

module.exports = { createLineWindow };
