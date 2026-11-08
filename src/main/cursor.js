'use strict';

const { screen } = require('electron');
const {
  REVEAL_HOLD_MS, TUCK_GRACE_MS, PEEK_MS, CURSOR_POLL_MS,
} = require('../shared/constants');

/**
 * 光标检测与揭示状态机（对照原版 AppDelegate 的 reveal/tuck 逻辑）：
 * - 光标停在屏幕顶边（y <= 1）累计 REVEAL_HOLD_MS 后，绳子滑下
 * - 光标离开条带且不在照片上，TUCK_GRACE_MS 宽限后收起
 * - 新截图到达时 peek：自动滑出 PEEK_MS，期间无悬停则收起
 * - 拖动文件期间完全不动
 * 主进程只向渲染器广播可见性，窗口本身不移动。
 */
function createCursor({ getPrimaryId, getBounds, isDragging, isInteractive, onRevealChange, onInteractiveStuck }) {
  let revealed = false;
  let bandSince = 0; // 光标进入顶边条带的时间戳
  let tuckTimer = null;
  let peekTimer = null;

  function setRevealed(value) {
    if (revealed === value) return;
    revealed = value;
    onRevealChange(value);
  }

  function pointerInWindow() {
    const p = screen.getCursorScreenPoint();
    const b = getBounds();
    return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  }

  /** 新截图到达：展示一小段时间（原版 peek 行为） */
  function peek(ms = PEEK_MS) {
    setRevealed(true);
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      peekTimer = null;
      if (!isInteractive() && !pointerInWindow()) setRevealed(false);
    }, ms);
  }

  function tuckNow() {
    clearTimeout(tuckTimer);
    tuckTimer = null;
    clearTimeout(peekTimer);
    peekTimer = null;
    setRevealed(false);
  }

  function toggle() {
    if (revealed) tuckNow();
    else setRevealed(true);
  }

  setInterval(() => {
    if (isDragging()) return; // 拖动文件期间不动
    const p = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(p);
    const inBand = d.id === getPrimaryId() && p.y <= 1;

    if (inBand) {
      clearTimeout(tuckTimer);
      if (!revealed) {
        if (!bandSince) bandSince = Date.now();
        else if (Date.now() - bandSince >= REVEAL_HOLD_MS) {
          bandSince = 0;
          setRevealed(true);
        }
      }
      return;
    }
    bandSince = 0;
    if (!revealed) return;

    if (isInteractive()) {
      // 指针快速移出窗口时渲染器可能漏掉 leave：主进程是最终权威
      if (!pointerInWindow()) onInteractiveStuck();
      else clearTimeout(tuckTimer);
      return;
    }
    if (pointerInWindow()) {
      clearTimeout(tuckTimer);
      return;
    }
    if (!tuckTimer) {
      tuckTimer = setTimeout(() => {
        tuckTimer = null;
        setRevealed(false);
      }, TUCK_GRACE_MS);
    }
  }, CURSOR_POLL_MS);

  return { peek, tuckNow, toggle, isRevealed: () => revealed };
}

module.exports = { createCursor };
