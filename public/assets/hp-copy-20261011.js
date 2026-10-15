// Keep this narrowly scoped to the public landing page's comparison card.
(() => {
  const updateProfessionalCard = () => {
    const card = [...document.querySelectorAll('#ways .hp-v4-way-card')]
      .find((candidate) => candidate.querySelector('h3')?.textContent?.trim() === 'プロに頼む');
    const copy = card?.querySelector('p');
    if (!copy || !copy.textContent.includes('のサービスも。')) return;

    const emphasis = document.createElement('strong');
    emphasis.textContent = '費用例 20万〜数十万円※';
    copy.replaceChildren(
      document.createTextNode('プロの力で、しっかり残せる。'),
      document.createElement('br'),
      emphasis
    );
  };

  const observer = new MutationObserver(updateProfessionalCard);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  updateProfessionalCard();
})();
