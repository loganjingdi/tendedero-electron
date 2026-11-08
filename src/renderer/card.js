'use strict';

// 一张挂在绳子上的照片：夹子 + 玻璃相框 + 角标按钮（对照原版 PeggedView）
const Card = (() => {
  const PIN_SVG =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 1.2v4.3l2.6 2.6v1.1H2.4V8.1L5 5.5V1.2Z"/><path d="M3.6 2.4h2.8"/></svg>';
  const UNPIN_SVG =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 1.2v4.3l2.6 2.6v1.1H2.4V8.1L5 5.5V1.2Z"/><path d="M1.6 1.6l6.8 6.8"/></svg>';
  const X_SVG =
    '<svg width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">' +
    '<path d="M1.5 1.5l5 5M6.5 1.5l-5 5"/></svg>';

  let badgeTimer = null;

  function showBadge(el) {
    const badge = el.querySelector('.badge');
    badge.classList.add('show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.classList.remove('show'), 1200);
  }

  /**
   * 创建卡片 DOM。x/y/w 在插入 DOM 之前就位，避免首次布局被 position
   * 过渡动画掉（新卡片直接出现在挂绳点，随后只有入场掉落动画）。
   */
  function create(photo, { x, y, w, stagger = 0 }) {
    const el = document.createElement('div');
    el.className = 'card interactive';
    el.dataset.id = photo.id;
    el.style.setProperty('--tilt', `${photo.tilt}deg`);
    el.style.setProperty('--swing-delay', `${stagger}s`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.draggable = true;

    el.innerHTML =
      '<div class="swing arrive">' +
      `  <div class="clip${photo.pinned ? ' pinned' : ''}"></div>` +
      '  <div class="frame">' +
      `    <img alt="截图" style="width:${w - 8}px">` +
      `    <button class="corner pin" title="${photo.pinned ? '取消固定' : '固定'}">${photo.pinned ? UNPIN_SVG : PIN_SVG}</button>` +
      '    <button class="corner remove" title="移除">' + X_SVG + '</button>' +
      '    <div class="badge">已复制</div>' +
      '  </div>' +
      '</div>';

    const img = el.querySelector('img');
    img.src = photo.thumb; // dataURL 已在主进程生成，随 IPC 一次到位，无二次加载
    img.addEventListener('dragstart', (e) => e.preventDefault()); // img 不参与拖拽，由卡片处理
    img.addEventListener('load', () => {
      // 记住原始宽高比，布局时按参考实现限制照片最大高度
      el._aspect = img.naturalWidth / img.naturalHeight;
      sizeImg(el, parseFloat(el.style.width));
    });

    const swing = el.querySelector('.swing');
    // 入场动画结束后移除 .arrive，此后 breeze 的动画切换不会重启入场
    swing.addEventListener('animationend', () => swing.classList.remove('arrive'), { once: true });

    el.addEventListener('click', async (e) => {
      if (e.target.closest('.corner')) return;
      const ok = await window.api.copy(photo.id);
      if (ok) showBadge(el);
    });
    el.addEventListener('dblclick', () => window.api.open(photo.id));
    el.querySelector('.corner.pin').addEventListener('click', () => window.api.togglePin(photo.id));
    el.querySelector('.corner.remove').addEventListener('click', () => window.api.remove(photo.id));
    el.addEventListener('dragstart', (e) => {
      e.preventDefault(); // 让主进程用 webContents.startDrag 发起真实的文件拖拽
      window.api.dragStart(photo.id);
    });
    el.addEventListener('dragend', () => window.api.dragEnd());

    return el;
  }

  // 按卡片宽给照片定尺寸：宽铺满相框内沿，太高时以 maxH 封顶并保持比例
  // （对照原版 photoMaxHeight = 104 * scale，photoSize 保持比例缩入卡片区）
  function sizeImg(el, w) {
    const img = el.querySelector('img');
    const aspect = el._aspect;
    const maxH = Math.round(104 * (w / 150));
    if (!aspect) {
      // 图片尚未 load，先按宽度自适应
      img.style.width = `${w - 8}px`;
      img.style.height = '';
      return;
    }
    let iw = w - 8;
    let ih = iw / aspect;
    if (ih > maxH) {
      ih = maxH;
      iw = ih * aspect;
    }
    img.style.width = `${iw}px`;
    img.style.height = `${ih}px`;
  }

  function layout(el, { x, y, w }) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    sizeImg(el, w);
  }

  function setPinned(el, pinned) {
    el.querySelector('.clip').classList.toggle('pinned', pinned);
    const btn = el.querySelector('.corner.pin');
    btn.innerHTML = pinned ? UNPIN_SVG : PIN_SVG;
    btn.title = pinned ? '取消固定' : '固定';
  }

  return { create, layout, setPinned };
})();
