/* Secretary affection requests: isolated UI layer, no changes to battle logic. */
(() => {
  'use strict';
  const menu = document.getElementById('secmenu');
  const scene = document.getElementById('affectionScene');
  const icon = document.getElementById('affectionIcon');
  const title = document.getElementById('affectionTitle');
  const line = document.getElementById('affectionLine');
  const close = document.getElementById('affectionClose');
  if (!menu || !scene || !icon || !title || !line || !close) return;

  const replies = {
    hug: {
      icon: '🤗',
      title: 'ハグ',
      line: '「えっ、今ですか？……ふふ、少しだけですよ。今日もお疲れさまです」'
    },
    kiss: {
      icon: '💗',
      title: 'キス',
      line: '「キ、キスですか……？ では、頬にそっと……。戦いが終わるまで、どうかご無事で」'
    }
  };

  function showRequest(kind) {
    const reply = replies[kind];
    if (!reply) return;
    icon.textContent = reply.icon;
    title.textContent = reply.title;
    line.textContent = reply.line;
    scene.style.display = 'flex';
    close.focus({ preventScroll: true });
  }

  function closeRequest() {
    scene.style.display = 'none';
  }

  menu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-affection]');
    if (!button || !menu.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    showRequest(button.dataset.affection);
  });

  close.addEventListener('click', closeRequest);
  scene.addEventListener('click', (event) => {
    if (event.target === scene) closeRequest();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scene.style.display === 'flex') {
      event.preventDefault();
      closeRequest();
    }
  });
})();
