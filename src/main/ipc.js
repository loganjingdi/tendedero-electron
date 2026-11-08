'use strict';

const { ipcMain, clipboard, nativeImage, shell } = require('electron');
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
      // 拖出偶尔没有 dragend（目标应用行为异常），安全超时兜底，否则收起逻辑会冻住
      dragTimer = setTimeout(() => setDragging(false), DRAG_TIMEOUT_MS);
    }
  }

  ipcMain.handle(IPC.LINE_GET, () => state.payload());

  ipcMain.handle(IPC.PHOTO_COPY, (_e, id) => {
    const photo = state.get(id);
    if (!photo) return false;
    const img = nativeImage.createFromPath(photo.path);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    // 登记我们自己复制的内容：与剪贴板轮询的 toPNG 字节一致，防止重复挂绳
    state.setLastCopiedHash(state.sha256(img.toPNG()));
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
      // Windows 上 icon 必须提供；文件是绝对路径。拖出的是副本，绳上的保留
      lineWindow.webContents.startDrag({
        file: photo.path,
        icon: photo.thumb.resize({ width: 32, height: 32 }),
      });
    } catch (err) {
      console.error('startDrag 失败:', err.message);
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
    if (typeof text === 'string' && text) clipboard.writeText(text);
    wordPopup.hide();
  });
  ipcMain.on(IPC.WORD_HIDE, () => wordPopup.hide());

  return { isDragging: () => dragging };
}

module.exports = { registerIpc };
