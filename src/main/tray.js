'use strict';

const { Tray, Menu, nativeImage, globalShortcut, app } = require('electron');
const { SIZES, SIZE_LABELS } = require('../shared/constants');
const { makeIconPNG } = require('./tray-icon');

/**
 * 托盘应用的全部入口：托盘菜单 + 全局快捷键 Ctrl+Alt+T（对照原版 ⌃⌥T）。
 * 图标在内存里生成，不依赖二进制资源文件。
 */
function createTray({ state, cursor, onWordSelectToggle }) {
  const icon = nativeImage.createFromBuffer(makeIconPNG());
  const tray = new Tray(icon);
  tray.setToolTip('晾衣绳');

  function buildMenu() {
    const menu = Menu.buildFromTemplate([
      {
        label: cursor.isRevealed() ? '隐藏晾衣绳' : '显示晾衣绳',
        click: () => {
          cursor.toggle();
          buildMenu(); // 切换"显示/隐藏"文案
        },
      },
      { type: 'separator' },
      {
        label: '尺寸',
        submenu: Object.keys(SIZES).map((key) => ({
          label: SIZE_LABELS[key],
          type: 'radio',
          checked: state.size === key,
          click: () => state.setSize(key),
        })),
      },
      { type: 'separator' },
      { label: '清空晾衣绳', click: () => state.clear() },
      { type: 'separator' },
      {
        label: '划词翻译',
        type: 'checkbox',
        checked: state.wordSelectEnabled,
        click: (item) => {
          state.setWordSelectEnabled(item.checked);
          if (onWordSelectToggle) onWordSelectToggle(item.checked);
        },
      },
      { label: '退出', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  }

  buildMenu();

  // 全局快捷键：显示/隐藏（注册失败通常是被其他软件占用，只记录不崩溃）
  const ok = globalShortcut.register('Control+Alt+T', () => {
    cursor.toggle();
    buildMenu();
  });
  if (!ok) console.warn('Ctrl+Alt+T 注册失败（可能被其他应用占用）');

  tray.on('double-click', () => {
    cursor.toggle();
    buildMenu();
  });

  return { tray, refresh: buildMenu };
}

module.exports = { createTray };
