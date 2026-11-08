'use strict';

// IPC 通道名（渲染进程经 preload 暴露的 api 使用，主进程注册处理器）
const IPC = {
  LINE_GET: 'line:get',
  LINE_CHANGED: 'line:changed',
  LINE_VISIBILITY: 'line:visibility',
  PHOTO_COPY: 'photo:copy',
  PHOTO_OPEN: 'photo:open',
  PHOTO_TOGGLE_PIN: 'photo:togglePin',
  PHOTO_REMOVE: 'photo:remove',
  PHOTO_DRAG_START: 'photo:dragStart',
  PHOTO_DRAG_END: 'photo:dragEnd',
  POINTER_INTERACTIVE: 'pointer:interactive',
  POINTER_INTERACTIVE_RESET: 'pointer:interactive:reset',
  LINE_HIDE: 'line:hide',
  WORD_RESULT: 'word:result',
  WORD_TRANSLATE: 'word:translate',
  WORD_COPY_TEXT: 'word:copyText',
  WORD_HIDE: 'word:hide',
};

// 照片尺寸（对照原版 Layout.Size）
const SIZES = { small: 0.8, medium: 1, large: 1.35 };
const SIZE_LABELS = { small: '小', medium: '中', large: '大' };

// 几何常量（DIP，对照原版 Layout / LineView）
const CARD_WIDTH = 150; // 中等尺寸的卡片宽
const GAP = 24; // 正常间距
const ROPE_TOP = 26; // 绳子顶部到窗口顶部的距离
const WINDOW_HEIGHT = 220; // 条带窗口高度（藏起 + 揭示共用）
const MAX_LOOSE = 8; // 最多几张非固定照片，超出时最老的自动落下
const THUMB_WIDTH = 405; // 缩略图宽度（约最大卡片宽的 2 倍，三种尺寸共用）

// 时序（毫秒）
const REVEAL_HOLD_MS = 250; // 光标停在顶边多久后滑下
const TUCK_GRACE_MS = 250; // 光标离开面板多久后收起
const PEEK_MS = 2500; // 新截图到达时自动展示多久
const CLIPBOARD_POLL_MS = 500; // 剪贴板轮询间隔
const CURSOR_POLL_MS = 100; // 光标位置轮询间隔
const DRAG_TIMEOUT_MS = 30000; // 拖出操作的安全超时
const SAVE_DEBOUNCE_MS = 300; // 状态持久化去抖
const WORD_SELECT_DELAY_MS = 500; // 划选松开后多久自动弹出取词
const WORD_POPUP_TIMEOUT_MS = 15000; // 取词弹窗无人操作时多久自动关闭

// 剪贴板图片上限（字节），超过的不挂
const MAX_CLIPBOARD_BYTES = 64 * 1024 * 1024;

module.exports = {
  IPC,
  SIZES,
  SIZE_LABELS,
  CARD_WIDTH,
  GAP,
  ROPE_TOP,
  WINDOW_HEIGHT,
  MAX_LOOSE,
  THUMB_WIDTH,
  REVEAL_HOLD_MS,
  TUCK_GRACE_MS,
  PEEK_MS,
  CLIPBOARD_POLL_MS,
  CURSOR_POLL_MS,
  DRAG_TIMEOUT_MS,
  SAVE_DEBOUNCE_MS,
  WORD_SELECT_DELAY_MS,
  WORD_POPUP_TIMEOUT_MS,
  MAX_CLIPBOARD_BYTES,
};
