(() => {
const sampleMarkup = `
  <div class="hp-book-sample-heading">
    <span class="hp-book-sample-kicker">実際のページと声</span>
    <h2 id="book-sample-title">声が、本になる。</h2>
  </div>
  <div class="hp-book-sample-spread" aria-label="実際の本の見開き。スマートフォンでは横にスワイプできます">
    <figure class="hp-book-sample-sheet">
      <button type="button" class="hp-book-sample-page-button" data-sample-page="0" aria-label="質問と家族写真のページを拡大">
        <span class="hp-book-sample-page-frame">
          <img src="/assets/book-sample-page-57-no-qr.jpg" alt="家族への想いを尋ねる問いと、幼い頃の家族写真を載せた実際のページ" loading="lazy" width="1438" height="1969">
        </span>
        <span class="hp-book-sample-zoom-mark" aria-hidden="true">＋</span>
      </button>
      <figcaption>問いと、家族の写真</figcaption>
    </figure>
    <figure class="hp-book-sample-sheet">
      <button type="button" class="hp-book-sample-page-button" data-sample-page="1" aria-label="語りを綴ったページを拡大">
        <span class="hp-book-sample-page-frame">
          <img src="/assets/book-sample-page-58.jpg" alt="家族への想いを本人の言葉で綴った実際のページ" loading="lazy" width="1438" height="1969">
        </span>
        <span class="hp-book-sample-zoom-mark" aria-hidden="true">＋</span>
      </button>
      <figcaption>本人の言葉を、文章に</figcaption>
    </figure>
  </div>
  <p class="hp-book-sample-swipe">横にスワイプして次のページへ <span aria-hidden="true">→</span></p>
  <div class="hp-book-sample-audio">
    <span class="hp-book-sample-audio-label">本人の声</span>
    <audio controls preload="metadata" aria-label="Week 3-4 家族への想いについての本人の語り">
      <source src="/assets/book-sample-week3-4-100s.mp3" type="audio/mpeg">
      お使いのブラウザーでは音声を再生できません。
    </audio>
  </div>
  <dialog class="hp-book-sample-dialog" aria-label="実際のページの拡大表示">
    <button type="button" class="hp-book-sample-dialog-close" aria-label="拡大表示を閉じる">×</button>
    <div class="hp-book-sample-dialog-content"></div>
  </dialog>
`;

function installBookSample() {
  const ways = document.getElementById('ways');
  const scenes = document.getElementById('scenes');
  if (!ways || !scenes || document.getElementById('book-sample-preview')) return;

  const section = document.createElement('section');
  section.id = 'book-sample-preview';
  section.className = 'hp-book-sample hp-shell';
  section.setAttribute('aria-labelledby', 'book-sample-title');
  section.innerHTML = sampleMarkup;
  ways.after(section);
  if (location.hash === '#book-sample-preview') {
    requestAnimationFrame(() => section.scrollIntoView({ block: 'start' }));
  }

  const dialog = section.querySelector('.hp-book-sample-dialog');
  const dialogContent = section.querySelector('.hp-book-sample-dialog-content');
  const closeButton = section.querySelector('.hp-book-sample-dialog-close');
  const pageButtons = [...section.querySelectorAll('[data-sample-page]')];

  pageButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.querySelector('.hp-book-sample-page-frame').cloneNode(true);
      dialogContent.replaceChildren(page);
      dialog.showModal();
    });
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

installBookSample();
new MutationObserver(installBookSample).observe(document.getElementById('root') || document.body, {
  childList: true,
  subtree: true
});
})();
