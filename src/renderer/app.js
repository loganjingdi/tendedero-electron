'use strict';

// 渲染层装配：接收 line:changed 全量同步，按 id 增量 diff ——
// 只有新照片播放入场动画，旧照片纹丝不动（防闪动的关键之一）
(() => {
  const api = window.api;
  const lineEl = document.getElementById('line');
  const hintEl = document.getElementById('hint');
  const cardsEl = document.getElementById('cards');

  const cards = new Map(); // id -> 卡片元素
  let photos = [];
  let cardW = 150;
  let revealed = false;
  let interactive = false;
  let hoveredId = null;

  // 压缩布局：居中、间距固定 24，放不下时均匀压缩（对照原版 Layout.x 的非滚动分支）
  function computeLayout() {
    const W = window.innerWidth;
    const n = photos.length;
    if (n === 0) return null;
    const gap = n > 1 ? Math.min(24, Math.floor((W - 64 - n * cardW) / (n - 1))) : 24;
    const totalW = n * cardW + (n - 1) * gap;
    const startX = (W - totalW) / 2;
    return photos.map((p, i) => {
      const x = startX + i * (cardW + gap);
      return { id: p.id, x, y: Rope.ropeY(x + cardW / 2, W) - 9, w: cardW };
    });
  }

  function updateHint() {
    const visible = revealed && photos.length === 0;
    hintEl.classList.toggle('visible', visible);
    if (visible) {
      const W = window.innerWidth;
      hintEl.style.top = `${Rope.ropeY(W / 2, W) + 34}px`;
    }
  }

  function render(payload) {
    photos = payload.photos;
    cardW = payload.cardW || 150;

    const positions = computeLayout();
    const byId = new Map((positions || []).map((p) => [p.id, p]));

    const seen = new Set();
    photos.forEach((p, i) => {
      seen.add(p.id);
      let el = cards.get(p.id);
      if (!el) {
        // 新卡片：带上最终位置创建，不会从角落飞进来
        const pos = byId.get(p.id);
        el = Card.create(p, { ...pos, stagger: i * 0.06 });
        cards.set(p.id, el);
        cardsEl.appendChild(el);
      } else if (byId.has(p.id)) {
        // 已有卡片：通过 position 过渡平滑让位
        Card.layout(el, byId.get(p.id));
      }
      Card.setPinned(el, p.pinned);
      el.style.zIndex = p.pinned ? 1 : 0; // 固定的滑过别处时不被盖住
    });

    for (const [id, el] of cards) {
      if (!seen.has(id)) {
        el.remove();
        cards.delete(id);
      }
    }
    updateHint();
  }

  // 光标悬停检测：窗口点击穿透时（forward 模式）mousemove 依然到达，
  // 悬停在 .interactive 元素上时通知主进程解除穿透
  function setupPointer() {
    window.addEventListener('mousemove', (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const hit = !!(el && el.closest('.interactive'));
      if (hit !== interactive) {
        interactive = hit;
        api.setInteractive(hit);
      }
      const card = el && el.closest('.card');
      hoveredId = card ? card.dataset.id : null;
    });
    api.onInteractiveReset(() => {
      interactive = false;
    });
  }

  function setupKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && hoveredId) api.remove(hoveredId);
      if (e.key === 'Escape') api.hideLine();
    });
  }

  // 微风：每 7~16 秒随机一张照片轻轻摆一下（对照原版 scheduleGust）
  function setupBreeze() {
    const tick = () => {
      setTimeout(() => {
        const swings = [...document.querySelectorAll('.card .swing')];
        const candidates = swings.filter((s) => !s.closest('.card').matches(':hover'));
        if (candidates.length) {
          const el = candidates[Math.floor(Math.random() * candidates.length)];
          const amp = (1.6 + Math.random() * 1.8) * (Math.random() < 0.5 ? -1 : 1);
          el.style.setProperty('--breeze-amp', `${amp}deg`);
          el.classList.add('breeze');
          el.addEventListener('animationend', () => el.classList.remove('breeze'), { once: true });
        }
        tick();
      }, 7000 + Math.random() * 9000);
    };
    tick();
  }

  async function boot() {
    render(await api.getLine());

    api.onLineChanged(render);
    api.onVisibility((r) => {
      revealed = r;
      lineEl.classList.toggle('revealed', r);
      updateHint();
    });

    setupPointer();
    setupKeys();
    setupBreeze();

    Rope.draw();
    updateHint();
    window.addEventListener('resize', () => {
      Rope.draw();
      render({ photos, cardW }); // 重新计算布局（position 过渡让卡片平滑滑到新位置）
    });
  }

  boot();
})();
