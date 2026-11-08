'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('./shared/constants');

// 渲染进程只能通过这里暴露的 api 与主进程通信
contextBridge.exposeInMainWorld('api', {
  getLine: () => ipcRenderer.invoke(IPC.LINE_GET),
  copy: (id) => ipcRenderer.invoke(IPC.PHOTO_COPY, id),
  open: (id) => ipcRenderer.invoke(IPC.PHOTO_OPEN, id),
  togglePin: (id) => ipcRenderer.invoke(IPC.PHOTO_TOGGLE_PIN, id),
  remove: (id) => ipcRenderer.invoke(IPC.PHOTO_REMOVE, id),
  dragStart: (id) => ipcRenderer.send(IPC.PHOTO_DRAG_START, id),
  dragEnd: () => ipcRenderer.send(IPC.PHOTO_DRAG_END),
  setInteractive: (value) => ipcRenderer.send(IPC.POINTER_INTERACTIVE, value),
  hideLine: () => ipcRenderer.send(IPC.LINE_HIDE),

  onLineChanged: (cb) => ipcRenderer.on(IPC.LINE_CHANGED, (_e, payload) => cb(payload)),
  onVisibility: (cb) => ipcRenderer.on(IPC.LINE_VISIBILITY, (_e, revealed) => cb(revealed)),
  onInteractiveReset: (cb) => ipcRenderer.on(IPC.POINTER_INTERACTIVE_RESET, () => cb()),

  // 划词翻译（取词弹窗页面使用）
  onWordResult: (cb) => ipcRenderer.on(IPC.WORD_RESULT, (_e, state) => cb(state)),
  wordTranslate: () => ipcRenderer.send(IPC.WORD_TRANSLATE),
  wordCopyText: (text) => ipcRenderer.send(IPC.WORD_COPY_TEXT, text),
  wordHide: () => ipcRenderer.send(IPC.WORD_HIDE),
});
