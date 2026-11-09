'use strict';

const { ipcMain, clipboard, nativeImage, shell, ClipboardItem } = require('electron');
const { IPC, DRAG_TIMEOUT_MS } = require('../shared/constants');

/**
 * 渲染进程 → 主进程 的全部通道：
 * invoke（有返回值）：line:get / photo:copy / photo:open / photo:togglePin / photo:remove
 * send（无返回值）：photo:dragStart / photo:dragEnd / pointer:interactive / line:hide
 */
function registerIpc({ state, lineWindow, cursor, wordPopup }) {
  let dragging = false;
  let dragTimer = null;

  function setDragging(value) {
    dragging = value;
    clearTimeout(dragTimer);
    if (value) {
      // startDrag 同步返回后立即复位（见 PHOTO_DRAG_START），这里只是极端情况的安全兜底
      dragTimer = setTimeout(() => setDragging(false), DRAG_TIMEOUT_MS);
    }
  }

  ipcMain.handle(IPC.LINE_GET, () => state.payload());

  ipcMain.handle(IPC.PHOTO_COPY, async (_e, id) => {
    const photo = state.get(id);
    if (!photo) return false;
    const img = nativeImage.createFromPath(photo.path);
    if (img.isEmpty()) return false;
    const png = img.toPNG();
    // Electron 45：writeImage 已移除，用 image/png ClipboardItem 写入
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
    // 登记我们自己复制的内容：与剪贴板轮询读回的 PNG 字节一致，防止重复挂绳
    state.setLastCopiedHash(state.sha256(png));
    return true;
  });

  ipcMain.handle(IPC.PHOTO_OPEN, (_e, id) => {
    const photo = state.get(id);
    if (photo) shell.openPath(photo.path);
  });

  ipcMain.handle(IPC.PHOTO_TOGGLE_PIN, (_e, id) => state.togglePin(id));

  ipcMain.handle(IPC.PHOTO_REMOVE, (_e, id) => state.removePhoto(id, { trash: true }));

  ipcMain.on(IPC.PHOTO_DRAG_START, (_e, id) => {
    const photo = state.get(id);
    if (!photo || dragging) return;
    setDragging(true);
    try {
      // Windows 上 icon 必须提供；文件是绝对路径。拖出的是副本，绳上的保留。
      // startDrag 在 Windows 上是同步阻塞：返回即拖拽结束。渲染进程的 dragend
      // 实测经常不触发，不能靠它复位——在 finally 里直接复位。
      lineWindow.webContents.startDrag({
        file: photo.path,
        icon: photo.thumb.resize({ width: 32, height: 32 }),
      });
    } catch (err) {
      console.error('startDrag 失败:', err.message);
    } finally {
      setDragging(false);
    }
  });

  ipcMain.on(IPC.PHOTO_DRAG_END, () => {
    setDragging(false);
    if (!lineWindow.isInteractive()) lineWindow.setInteractive(false);
  });

  ipcMain.on(IPC.POINTER_INTERACTIVE, (_e, value) => lineWindow.setInteractive(!!value));

  ipcMain.on(IPC.LINE_HIDE, () => cursor.tuckNow());

  // 划词翻译弹窗的动作
  ipcMain.on(IPC.WORD_TRANSLATE, () => {
    wordPopup.sendState({ phase: 'note', text: '翻译功能待接入' }); // 翻译本体后续接入
  });
  ipcMain.on(IPC.WORD_COPY_TEXT, (_e, text) => {
    if (typeof text === 'string' && text) clipboard.writeText(text).catch(() => {});
    wordPopup.hide();
  });
  ipcMain.on(IPC.WORD_HIDE, () => wordPopup.hide());

  return { isDragging: () => dragging };
}

module.exports = { registerIpc };
