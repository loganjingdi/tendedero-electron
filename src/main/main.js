'use strict';

const { app, globalShortcut, screen } = require('electron');
const { createState } = require('./state');
const { createLineWindow } = require('./line-window');
const { createCursor } = require('./cursor');
const { registerIpc } = require('./ipc');
const { createClipboardWatcher } = require('./clipboard-watcher');
const { createWordSelect } = require('./word-select');
const { createWordPopup } = require('./word-popup');
const ocr = require('./ocr');
const selectionReader = require('./selection-reader');
const { createTray } = require('./tray');

const isDev = process.argv.includes('--dev');

// Windows 通知/任务栏分组需要，在 ready 之前设置
app.setAppUserModelId('com.tendedero.electron');

// 单实例锁：第二个实例会重复监听剪贴板、重复注册快捷键
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 已经有一个晾衣绳了，忽略第二次启动
  });

  app.whenReady().then(() => {
    let lineWindow = null;
    let ipc = null;
    let refreshTray = null;

    const state = createState({
      onChanged: (payload) => {
        if (lineWindow) lineWindow.broadcast(payload);
      },
    });
    state.load(); // 恢复上次挂着的照片（文件已消失的自动剔除）

    lineWindow = createLineWindow({ isDev });

    const cursor = createCursor({
      getPrimaryId: lineWindow.getPrimaryId,
      getBounds: lineWindow.getBounds,
      isDragging: () => (ipc ? ipc.isDragging() : false),
      isInteractive: lineWindow.isInteractive,
      onRevealChange: (revealed) => {
        lineWindow.sendVisibility(revealed);
        if (refreshTray) refreshTray();
      },
      onInteractiveStuck: lineWindow.forceResetInteractive,
    });

    const wordPopup = createWordPopup();

    ipc = registerIpc({ state, lineWindow, cursor, wordPopup });

    // 划词翻译：全局鼠标钩子记录拖选，松开 0.5s 自动触发
    // → selection-hook 读选中文本（UIA/Accessibility/剪贴板兜底）→ 读不到回退 OCR
    let wordSeq = 0;
    const wordSelect = createWordSelect({
      isEnabled: () => state.wordSelectEnabled,
      // uiohook 给的是物理像素，Electron 是 DIP：按主显示器缩放换算（v1 单 DPI 假设）
      isInsideAppWindow: (pPhysical) => {
        const sf = screen.getPrimaryDisplay().scaleFactor;
        const p = { x: pPhysical.x / sf, y: pPhysical.y / sf };
        const lb = lineWindow.getBounds();
        if (p.x >= lb.x && p.x < lb.x + lb.width && p.y >= lb.y && p.y < lb.y + lb.height) return true;
        return wordPopup.containsDip(p);
      },
      onOutsideClick: () => wordPopup.hide(),
      onTrigger: (rect) => {
        const seq = ++wordSeq;
        const sf = screen.getPrimaryDisplay().scaleFactor;
        const point = { x: (rect.x + rect.w) / sf + 8, y: (rect.y + rect.h) / sf + 8 };
        wordPopup.showAt(point, { phase: 'loading' });
        (async () => {
          // 策略一：selection-hook 读选中文本（内部 UIA → Accessibility → 剪贴板兜底）
          let text = selectionReader.readSelectedText();
          // 策略二：读不到（图片/视频字幕/自绘界面）回退截图 OCR
          if (!text) {
            try {
              text = await ocr.recognize(rect);
            } catch (err) {
              console.error('OCR 失败:', err.message);
            }
          }
          // 期间又划了新的选区：旧结果作废，不覆盖新弹窗
          if (seq !== wordSeq) return;
          wordPopup.showAt(point, { phase: 'result', text });
        })();
      },
    });
    wordSelect.setActive(state.wordSelectEnabled);

    // 唯一的截图来源：剪贴板轮询
    const clipboardWatcher = createClipboardWatcher({
      state,
      onImage: (filePath, hash) => {
        const id = state.addPhoto(filePath, hash);
        if (id) cursor.peek(); // 新截图到达：绳子滑出一小会儿（原版 peek）
      },
    });
    clipboardWatcher.start();

    const tray = createTray({
      state,
      cursor,
      onWordSelectToggle: (on) => {
        wordSelect.setActive(on);
        wordPopup.hide();
      },
    });
    refreshTray = tray.refresh;
  });
}

app.on('window-all-closed', () => {
  // 托盘应用：没有普通窗口，晾衣绳窗口关闭也不退出
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
