'use strict';

// 绳子：一条从屏幕一端到另一端的抛物线，两端渐隐（对照原版 Rope/LineView.Layout）
const Rope = (() => {
  const ROPE_TOP = 26;
  const NS = 'http://www.w3.org/2000/svg';

  function sag(W) {
    return Math.min(30, W * 0.018);
  }

  // 绳子在 x 处的高度。二次贝塞尔控制点在 2*sag，中点恰好落在 ropeTop + sag
  function ropeY(x, W) {
    const s = sag(W);
    return ROPE_TOP + 4 * s * (x / W) * (1 - x / W);
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function draw() {
    const svg = document.getElementById('rope');
    const W = window.innerWidth;
    const H = window.innerHeight;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    const s = sag(W);
    const d = `M -20 ${ROPE_TOP} Q ${W / 2} ${ROPE_TOP + 2 * s} ${W + 20} ${ROPE_TOP}`;

    // 两端渐隐的渐变
    const grad = svgEl('linearGradient', {
      id: 'ropeFade',
      gradientUnits: 'objectBoundingBox',
      x1: '0', y1: '0', x2: '1', y2: '0',
    });
    for (const [offset, opacity] of [[0, 0], [0.08, 1], [0.92, 1], [1, 0]]) {
      grad.appendChild(svgEl('stop', { offset, 'stop-color': '#8c8c8c', 'stop-opacity': opacity }));
    }
    svg.appendChild(svgEl('defs', {})).appendChild(grad);

    // 阴影 → 主绳 → 高光，三段叠出立体感（对照原版 Rope）
    const shadow = svgEl('path', {
      d, stroke: 'black', 'stroke-opacity': '0.22',
      'stroke-width': '1.4', fill: 'none', transform: 'translate(0 1.2)',
    });
    shadow.style.filter = 'blur(1.2px)';
    const main = svgEl('path', {
      d, stroke: 'url(#ropeFade)', 'stroke-width': '1.2', fill: 'none',
    });
    const highlight = svgEl('path', {
      d, stroke: 'white', 'stroke-opacity': '0.45',
      'stroke-width': '0.4', fill: 'none', transform: 'translate(0 -0.35)',
    });
    svg.append(shadow, main, highlight);
  }

  return { draw, ropeY, ROPE_TOP };
})();
