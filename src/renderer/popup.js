'use strict';

// 取词弹窗渲染：识别中 → 文字预览 + 「翻译」「复制文本」
(() => {
  const api = window.api;
  const body = document.getElementById('body');
  const loadingEl = document.getElementById('loading');
  const textEl = document.getElementById('text');
  const noteEl = document.getElementById('note');

  let currentText = '';

  function setState(state) {
    loadingEl.style.display = 'none';
    textEl.classList.remove('visible', 'empty');
    noteEl.classList.remove('visible');

    if (state.phase === 'loading') {
      loadingEl.style.display = 'block';
      textEl.textContent = '';
      return;
    }
    if (state.phase === 'note') {
      noteEl.textContent = state.text;
      noteEl.classList.add('visible');
      return;
    }
    // result
    currentText = state.text || '';
    textEl.textContent = currentText || '未识别到文字，试试更清晰的选区';
    textEl.classList.add('visible');
    if (!currentText) textEl.classList.add('empty');
  }

  api.onWordResult(setState);
  document.getElementById('translate').addEventListener('click', () => api.wordTranslate());
  document.getElementById('copy').addEventListener('click', () => {
    if (currentText) api.wordCopyText(currentText);
  });
  document.getElementById('close').addEventListener('click', () => api.wordHide());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.wordHide();
  });
})();
