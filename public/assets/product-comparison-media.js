// The HP product section and the purchase selector use this same media element.
const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="/assets/product-comparison-media.css">
  <figure class="comparison-media" aria-label="スタンダードとプレミアムの実物冊子とWebブックの動画">
    <p class="comparison-plan-label">左：スタンダード　右：プレミアム</p>
    <div class="comparison-stage">
      <img class="comparison-fallback" src="/assets/product-plan-comparison-fallback.jpg" width="960" height="540" alt="手が写っていない状態で同じ卓上に並んだスタンダードとプレミアムの実物冊子">
      <video class="comparison-video" muted playsinline loop preload="none" poster="/assets/product-plan-comparison-fallback.jpg" width="960" height="540" aria-label="実物冊子の装丁とページ、続いてWebブックの開き方を紹介する動画">
        <source src="/assets/product-plan-comparison.mp4" type="video/mp4">
      </video>
    </div>
    <figcaption class="comparison-caption">本動画でWebブックの開き方もご覧になれます。</figcaption>
    <div class="comparison-timeline" hidden>
      <input type="range" min="0" max="100" value="0" step="0.1" aria-label="動画の再生位置" disabled>
      <output>0:00 / --:--</output>
    </div>
    <div class="comparison-controls">
      <button class="comparison-toggle" type="button" aria-label="動画を再生" hidden>再生</button>
      <button class="comparison-sound" type="button" aria-label="動画の音を聞く" aria-pressed="false" hidden>音を聞く</button>
      <button class="comparison-expand" type="button" aria-label="動画を拡大" hidden>拡大</button>
    </div>
  </figure>`;

class ProductComparisonMedia extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) {
      this.observer?.observe(this.shadowRoot.querySelector('.comparison-stage'));
      document.addEventListener('fullscreenchange', this.onFullscreenChange);
      this.shadowRoot.addEventListener('fullscreenchange', this.onFullscreenChange);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.parentViewport?.addEventListener('scroll', this.onParentViewportChange, { passive: true });
      this.parentViewport?.addEventListener('resize', this.onParentViewportChange);
      this.onParentViewportChange?.();
      return;
    }
    const root = this.attachShadow({ mode: 'open' });
    root.append(template.content.cloneNode(true));
    const frame = root.querySelector('.comparison-media');
    const stage = root.querySelector('.comparison-stage');
    const video = root.querySelector('video');
    const toggle = root.querySelector('.comparison-toggle');
    const sound = root.querySelector('.comparison-sound');
    const expand = root.querySelector('.comparison-expand');
    const timeline = root.querySelector('.comparison-timeline');
    const position = root.querySelector('input');
    const time = root.querySelector('output');
    if (!video.canPlayType('video/mp4')) return;

    toggle.hidden = false;
    sound.hidden = false;
    expand.hidden = !((document.fullscreenEnabled && frame.requestFullscreen) || video.webkitEnterFullscreen);
    timeline.hidden = false;
    let userPaused = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = Boolean(navigator.connection?.saveData);
    const updateButton = () => {
      const playing = !video.paused;
      toggle.textContent = playing ? '一時停止' : '再生';
      toggle.setAttribute('aria-label', playing ? '動画を一時停止' : '動画を再生');
    };
    const clock = seconds => Number.isFinite(seconds)
      ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}` : '--:--';
    const updatePosition = () => {
      const duration = video.duration;
      const ready = Number.isFinite(duration) && duration > 0;
      position.disabled = !ready;
      if (ready) {
        position.max = String(duration);
        position.value = String(Math.min(video.currentTime, duration));
        position.style.setProperty('--progress', `${video.currentTime / duration * 100}%`);
      }
      time.textContent = `${clock(video.currentTime)} / ${clock(duration)}`;
    };
    const setSound = muted => {
      video.muted = muted;
      sound.textContent = muted ? '音を聞く' : '音を消す';
      sound.setAttribute('aria-label', muted ? '動画の音を聞く' : '動画の音を消す');
      sound.setAttribute('aria-pressed', String(!muted));
    };
    const updateExpand = () => {
      const full = frame.matches(':fullscreen');
      expand.textContent = full ? '縮小' : '拡大';
      expand.setAttribute('aria-label', full ? '動画を縮小' : '動画を拡大');
    };
    const start = async () => {
      try { await video.play(); frame.classList.add('is-playing'); }
      catch { frame.classList.remove('is-playing'); }
      updateButton();
    };
    const stop = (resetSound = false) => {
      video.pause();
      if (resetSound) setSound(true);
      updateButton();
    };
    // The HP places this element in a tall same-origin iframe. Its own viewport
    // can contain the video while the actual HP viewport is still far away.
    const visibleFraction = () => {
      const rect = stage.getBoundingClientRect();
      let top = rect.top;
      let left = rect.left;
      let bottom = rect.bottom;
      let right = rect.right;
      let view = window;
      while (view) {
        top = Math.max(top, 0);
        left = Math.max(left, 0);
        bottom = Math.min(bottom, view.innerHeight);
        right = Math.min(right, view.innerWidth);
        const hostFrame = view.frameElement;
        if (!hostFrame) break;
        const hostRect = hostFrame.getBoundingClientRect();
        top += hostRect.top;
        bottom += hostRect.top;
        left += hostRect.left;
        right += hostRect.left;
        view = hostFrame.ownerDocument.defaultView;
      }
      return Math.max(0, bottom - top) * Math.max(0, right - left) / (rect.width * rect.height || 1);
    };
    const syncPlayback = () => {
      if (visibleFraction() < .5 || document.hidden) { stop(true); return; }
      if (!userPaused && !reducedMotion && !saveData) start();
    };
    video.addEventListener('play', () => { frame.classList.add('is-playing'); updateButton(); });
    video.addEventListener('pause', updateButton);
    video.addEventListener('error', () => {
      frame.classList.remove('is-playing');
      toggle.hidden = sound.hidden = expand.hidden = timeline.hidden = true;
    });
    for (const event of ['loadedmetadata', 'durationchange', 'timeupdate']) video.addEventListener(event, updatePosition);
    position.addEventListener('input', () => { if (!position.disabled) video.currentTime = Number(position.value); });
    toggle.addEventListener('click', () => {
      if (video.paused) { userPaused = false; start(); }
      else { userPaused = true; stop(); }
    });
    sound.addEventListener('click', () => {
      setSound(!video.muted);
      if (video.paused) { userPaused = false; start(); }
    });
    expand.addEventListener('click', async () => {
      try {
        if (frame.matches(':fullscreen')) await document.exitFullscreen();
        else if (document.fullscreenEnabled && frame.requestFullscreen) await frame.requestFullscreen();
        else if (video.webkitEnterFullscreen) { video.controls = true; video.webkitEnterFullscreen(); }
      } catch {
        if (video.webkitEnterFullscreen) {
          try { video.controls = true; video.webkitEnterFullscreen(); }
          catch { video.controls = false; expand.hidden = true; }
        } else expand.hidden = true;
      }
      updateExpand();
    });
    this.onFullscreenChange = updateExpand;
    this.onVisibilityChange = syncPlayback;
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    root.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    video.addEventListener('webkitendfullscreen', () => { video.controls = false; updateExpand(); });
    this.observer = new IntersectionObserver(syncPlayback, { threshold: [0, .5, 1] });
    this.observer.observe(stage);
    const hostFrame = window.frameElement;
    this.parentViewport = hostFrame?.ownerDocument.defaultView;
    this.onParentViewportChange = syncPlayback;
    this.parentViewport?.addEventListener('scroll', this.onParentViewportChange, { passive: true });
    this.parentViewport?.addEventListener('resize', this.onParentViewportChange);
    setSound(true);
    updateButton();
    updateExpand();
    updatePosition();
    syncPlayback();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.shadowRoot?.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.parentViewport?.removeEventListener('scroll', this.onParentViewportChange);
    this.parentViewport?.removeEventListener('resize', this.onParentViewportChange);
    this.shadowRoot?.querySelector('video')?.pause();
  }
}

if (!customElements.get('product-comparison-media')) {
  customElements.define('product-comparison-media', ProductComparisonMedia);
}
