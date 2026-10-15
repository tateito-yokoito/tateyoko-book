// Installed only with the dedicated family-three-questions release. The
// production landing page is assembled from two pinned overlay bundles, so a
// narrowly scoped adapter avoids rebuilding unrelated sections.
(() => {
  const destination = '/gift-three-questions.html';
  const oldFaq = '現在の「家族に3問を贈る」はログイン画面へ進みます。ギフトの開始方法と受け取る方の手順は、正式公開前にご案内します。';
  const newFaq = '無料の3問への専用リンクを、LINEなどで家族に送れます。ご本人が語った内容は勝手に共有されません。';
  let queued = false;
  function update() {
    queued = false;
    document.querySelectorAll('a').forEach(anchor => {
      if (anchor.textContent.replace(/\s/g, '') === '家族に3問を贈る→' && anchor.getAttribute('href') !== destination) {
        anchor.setAttribute('href', destination);
      }
    });
    const note = document.querySelector('.hp-price-v2-gift-path');
    if (note && note.textContent.includes('ログイン後')) {
      note.textContent = 'LINEなどで、無料の3問への専用リンクを贈れます。';
    }
    document.querySelectorAll('details p').forEach(paragraph => {
      if (paragraph.textContent === oldFaq) paragraph.textContent = newFaq;
    });
  }
  const observer = new MutationObserver(() => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  update();
})();
