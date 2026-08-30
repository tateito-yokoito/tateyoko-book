import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./voice-playback.css";

const SUPPORT_EMAIL = "sugawara@saltlight.co.jp";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const voiceNumber = (index) => `声 ${String(index + 1).padStart(2, "0")}`;
const storageKey = (publicId, kind) => `tateyoko.voice.${publicId}.${kind}.v1`;

function readStored(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

export default function VoicePlaybackPage({ supabaseClient, publicId }) {
  const audioRef = useRef(null);
  const autoplayRef = useRef(false);
  const assetUrlCacheRef = useRef(new Map());
  const [publication, setPublication] = useState(null);
  const [status, setStatus] = useState("loading");
  const [screen, setScreen] = useState("home");
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playedItems, setPlayedItems] = useState(() => new Set());
  const [savedProgress, setSavedProgress] = useState(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState("");
  const [currentPhotoUrls, setCurrentPhotoUrls] = useState([]);
  const [assetStatus, setAssetStatus] = useState("idle");
  const [assetRetry, setAssetRetry] = useState(0);

  const progressKey = storageKey(publicId, "progress");
  const accessKey = storageKey(publicId, "access");

  const loadPublication = useCallback(async (code = "") => {
    setStatus("loading");
    const storedAccess = readStored(accessKey, {});
    const { data, error } = await supabaseClient.functions.invoke("public-voice", {
      body: {
        publicId,
        accessCode: code,
        accessToken: storedAccess?.token || ""
      }
    });

    if (!error && data?.codeRequired) {
      setAccessError(Boolean(data.invalidCode));
      setStatus("locked");
      return;
    }
    if (error || !data?.success || !data?.publication) {
      setPublication(null);
      setStatus("unavailable");
      return;
    }

    if (data.accessToken) {
      window.localStorage.setItem(accessKey, JSON.stringify({ token: data.accessToken }));
    }
    const progress = readStored(progressKey, null);
    setSavedProgress(progress);
    setPlayedItems(new Set(Array.isArray(progress?.playedItems) ? progress.playedItems : []));
    setPublication(data.publication);
    setAccessError(false);
    setAccessCode("");
    setStatus("ready");
  }, [accessKey, progressKey, publicId, supabaseClient]);

  useEffect(() => { loadPublication(); }, [loadPublication]);
  useEffect(() => {
    document.body.classList.add("voice-page-active");
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow,noarchive";
    document.head.appendChild(robots);
    return () => {
      document.body.classList.remove("voice-page-active");
      robots.remove();
    };
  }, []);

  const items = publication?.items || [];
  const currentItem = items[currentItemIndex] || null;
  const currentAsset = currentItem?.audio?.[currentPartIndex] || null;

  const resolveAssetUrl = useCallback(async ({ itemOrder, assetIndex, kind }) => {
    const cacheKey = `${kind}:${itemOrder}:${assetIndex}`;
    const cached = assetUrlCacheRef.current.get(cacheKey);
    if (cached?.url && cached.expiresAt > Date.now()) return cached.url;

    const storedAccess = readStored(accessKey, {});
    const { data, error } = await supabaseClient.functions.invoke("public-voice", {
      body: {
        action: "asset",
        publicId,
        itemOrder,
        assetIndex,
        kind,
        accessToken: storedAccess?.token || ""
      }
    });
    if (error || !data?.success || !data?.asset?.url) throw new Error("asset unavailable");

    const lifetimeSeconds = Math.max(60, Number(data.asset.expiresInSeconds || 0));
    assetUrlCacheRef.current.set(cacheKey, {
      url: data.asset.url,
      expiresAt: Date.now() + Math.max(30, lifetimeSeconds - 60) * 1000
    });
    return data.asset.url;
  }, [accessKey, publicId, supabaseClient]);

  useEffect(() => {
    if (screen !== "player" || !currentItem || !currentAsset) return undefined;
    let cancelled = false;
    setAssetStatus("loading");
    setCurrentAudioUrl("");
    setCurrentPhotoUrls([]);

    const audioRequest = resolveAssetUrl({
      itemOrder: currentItem.order,
      assetIndex: currentAsset.assetIndex,
      kind: "audio"
    });
    const photoRequest = Promise.all((currentItem.photos || []).map(async (photo) => ({
      ...photo,
      url: await resolveAssetUrl({
        itemOrder: currentItem.order,
        assetIndex: photo.assetIndex,
        kind: "photo"
      })
    }))).catch(() => []);

    Promise.all([audioRequest, photoRequest])
      .then(([audioUrl, photos]) => {
        if (cancelled) return;
        setCurrentAudioUrl(audioUrl);
        setCurrentPhotoUrls(photos);
        setAssetStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        autoplayRef.current = false;
        setIsPlaying(false);
        setAssetStatus("error");
      });

    return () => { cancelled = true; };
  }, [assetRetry, currentAsset, currentItem, resolveAssetUrl, screen]);

  const saveProgress = useCallback((overrides = {}) => {
    if (!publication || !currentItem) return;
    const payload = {
      itemIndex: currentItemIndex,
      partIndex: currentPartIndex,
      time: currentTime,
      playedItems: Array.from(playedItems),
      updatedAt: Date.now(),
      ...overrides
    };
    window.localStorage.setItem(progressKey, JSON.stringify(payload));
    setSavedProgress(payload);
  }, [currentItem, currentItemIndex, currentPartIndex, currentTime, playedItems, progressKey, publication]);

  useEffect(() => {
    if (screen !== "player") return undefined;
    const timer = window.setInterval(() => saveProgress(), 5000);
    return () => window.clearInterval(timer);
  }, [saveProgress, screen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudioUrl || screen !== "player") return;
    audio.load();
    const seekTo = clamp(currentTime, 0, Number.MAX_SAFE_INTEGER);
    const onLoaded = () => {
      if (seekTo > 0) audio.currentTime = Math.min(seekTo, audio.duration || seekTo);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (autoplayRef.current) audio.play().catch(() => setIsPlaying(false));
      autoplayRef.current = false;
    };
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => audio.removeEventListener("loadedmetadata", onLoaded);
    // Time is applied only when changing audio; regular progress updates must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAudioUrl, currentItemIndex, currentPartIndex, screen]);

  const groupedItems = useMemo(() => {
    const groups = [];
    items.forEach((item, index) => {
      const title = item.chapterTitle || "語り";
      let group = groups.find((entry) => entry.title === title);
      if (!group) {
        group = { title, entries: [] };
        groups.push(group);
      }
      group.entries.push({ item, index });
    });
    return groups;
  }, [items]);

  function openStory(itemIndex, partIndex = 0, time = 0, autoplay = true) {
    autoplayRef.current = autoplay;
    setCurrentItemIndex(clamp(itemIndex, 0, Math.max(items.length - 1, 0)));
    setCurrentPartIndex(partIndex);
    setCurrentTime(time);
    setDuration(0);
    setScreen("player");
  }

  function resumeStory() {
    if (!savedProgress || !items[savedProgress.itemIndex]) return;
    openStory(savedProgress.itemIndex, savedProgress.partIndex || 0, savedProgress.time || 0);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }

  function seekTo(value) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = clamp(value, 0, duration || 0);
    setCurrentTime(audio.currentTime);
  }

  function moveStory(direction) {
    if (direction < 0 && currentPartIndex > 0) return openStory(currentItemIndex, currentPartIndex - 1, 0);
    if (direction > 0 && currentPartIndex < (currentItem?.audio?.length || 1) - 1) {
      return openStory(currentItemIndex, currentPartIndex + 1, 0);
    }
    const nextIndex = currentItemIndex + direction;
    if (nextIndex >= 0 && nextIndex < items.length) return openStory(nextIndex, direction < 0 ? items[nextIndex].audio.length - 1 : 0, 0);
  }

  function handleEnded() {
    if (currentPartIndex < currentItem.audio.length - 1) {
      openStory(currentItemIndex, currentPartIndex + 1, 0);
      return;
    }
    const nextPlayed = new Set(playedItems);
    nextPlayed.add(currentItemIndex);
    setPlayedItems(nextPlayed);
    saveProgress({ playedItems: Array.from(nextPlayed), time: 0 });
    if (currentItemIndex < items.length - 1) openStory(currentItemIndex + 1, 0, 0);
    else {
      setIsPlaying(false);
      setScreen("finished");
    }
  }

  async function sharePublication() {
    const shareData = { title: publication.title || "縦糸横糸", url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => {});
    else await navigator.clipboard?.writeText(window.location.href);
  }

  if (status === "loading") return <StateScreen text="声のページをひらいています。" />;
  if (status === "locked") {
    return (
      <main className="voice-page voice-page-state">
        <img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" />
        <h1>この声には暗証番号が<br />設定されています。</h1>
        <form className="voice-access-form" onSubmit={(event) => { event.preventDefault(); loadPublication(accessCode); }}>
          <label htmlFor="voice-access-code">4〜8桁の数字</label>
          <input id="voice-access-code" inputMode="numeric" autoComplete="one-time-code" value={accessCode} onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 8))} />
          {accessError && <p>暗証番号が違います。</p>}
          <button type="submit" disabled={accessCode.length < 4}>声のページをひらく</button>
        </form>
      </main>
    );
  }
  if (status !== "ready") return <UnavailableScreen />;

  return (
    <main className="voice-page">
      <header className="voice-page-header">
        <button type="button" className="voice-wordmark" onClick={() => setScreen("home")} aria-label="この作品の表紙へ">
          <img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" />
        </button>
        {screen !== "home" && <button type="button" className="voice-header-action" onClick={() => setScreen("contents")}>声を選ぶ</button>}
      </header>

      {screen === "home" && (
        <section className="voice-home" aria-label="Web冊子の表紙">
          <div className="voice-cover">
            <span>WEB BOOK</span>
            <h1>{publication.title || "残された声"}</h1>
            {publication.subtitle && <p>{publication.subtitle}</p>}
            <div className="voice-cover-rule" />
            {publication.subjectName && <small>{publication.subjectName}</small>}
            {publication.footerText && <small>{publication.footerText}</small>}
          </div>
          <div className="voice-home-actions">
            <button type="button" className="voice-primary-button" onClick={() => openStory(0)}>最初から聴く</button>
            {savedProgress && <button type="button" onClick={resumeStory}>前回の続きから <small>{voiceNumber(savedProgress.itemIndex)}</small></button>}
            <button type="button" onClick={() => setScreen("contents")}>声を選ぶ</button>
          </div>
        </section>
      )}

      {screen === "contents" && (
        <section className="voice-contents">
          <p className="voice-kicker">VOICE INDEX</p>
          <h1>声を選ぶ</h1>
          {groupedItems.map((group) => (
            <div className="voice-theme" key={group.title}>
              <h2>{group.title}</h2>
              {group.entries.map(({ item, index }) => (
                <button type="button" className="voice-index-item" key={`${item.order}-${index}`} onClick={() => openStory(index)}>
                  <span className="voice-number">{playedItems.has(index) ? "✓" : voiceNumber(index)}</span>
                  <span><strong>{item.question || "残された声"}</strong>{item.transcript && <small>{item.transcript.slice(0, 70)}{item.transcript.length > 70 ? "…" : ""}</small>}</span>
                  <b aria-hidden="true">›</b>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      {screen === "player" && currentItem && currentAsset && (
        <section className="voice-player">
          <p className="voice-kicker">{voiceNumber(currentItemIndex)}</p>
          {currentItem.chapterTitle && <p className="voice-player-theme">{currentItem.chapterTitle}</p>}
          <h1>{currentItem.question || "残された声"}</h1>
          {currentPhotoUrls.length > 0 && (
            <div className="voice-photo-strip">
              {currentPhotoUrls.map((photo, index) => <figure key={`${photo.url}-${index}`}><img src={photo.url} alt={photo.caption || "この語りに添えられた写真"} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}
            </div>
          )}
          <div className="voice-audio-console">
            <audio ref={audioRef} src={currentAudioUrl || undefined} preload="metadata" onPlay={() => setIsPlaying(true)} onPause={() => { setIsPlaying(false); saveProgress(); }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onEnded={handleEnded} />
            {assetStatus === "error" ? (
              <div className="voice-asset-error"><p>音声をひらけませんでした。</p><button type="button" onClick={() => setAssetRetry((value) => value + 1)}>もう一度試す</button></div>
            ) : (
              <>
                {assetStatus === "loading" && <p className="voice-asset-loading" aria-live="polite">声を準備しています。</p>}
                <div className="voice-timeline"><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => seekTo(Number(event.target.value))} aria-label="再生位置" disabled={!currentAudioUrl} /><div><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
                <div className="voice-transport">
                  <button type="button" onClick={() => moveStory(-1)} disabled={currentItemIndex === 0 && currentPartIndex === 0} aria-label="前の声">‹</button>
                  <button type="button" onClick={() => seekTo(currentTime - 15)} disabled={!currentAudioUrl} aria-label="15秒戻る">−15</button>
                  <button type="button" className="voice-play-button" onClick={togglePlayback} disabled={!currentAudioUrl} aria-label={isPlaying ? "一時停止" : "再生"}>{isPlaying ? "Ⅱ" : "▶"}</button>
                  <button type="button" onClick={() => seekTo(currentTime + 15)} disabled={!currentAudioUrl} aria-label="15秒進む">+15</button>
                  <button type="button" onClick={() => moveStory(1)} disabled={currentItemIndex === items.length - 1 && currentPartIndex === currentItem.audio.length - 1} aria-label="次の声">›</button>
                </div>
              </>
            )}
          </div>
          {currentItem.transcript && <article className="voice-transcript"><p className="voice-kicker">WORDS</p><p>{currentItem.transcript}</p></article>}
          <div className="voice-player-nav"><button type="button" onClick={() => setScreen("contents")}>声の一覧へ</button>{currentItemIndex < items.length - 1 && <button type="button" onClick={() => openStory(currentItemIndex + 1)}>次の声へ</button>}</div>
        </section>
      )}

      {screen === "finished" && (
        <section className="voice-finished">
          <img src="/brand-logo-symbol.svg" alt="" />
          <p className="voice-kicker">END OF VOICES</p>
          <h1>声を聴いてくださり、<br />ありがとうございました。</h1>
          <div><button type="button" onClick={() => openStory(0)}>もう一度、最初から</button><button type="button" onClick={() => setScreen("contents")}>声を選ぶ</button><button type="button" onClick={sharePublication}>家族に共有する</button></div>
          <a className="voice-library-link" href="/?library=1">家族の本棚を見る</a>
        </section>
      )}

      <footer className="voice-page-footer"><img src="/brand-logo-symbol.svg" alt="" /><p>声を、本にする。</p></footer>
    </main>
  );
}

function StateScreen({ text }) {
  return <main className="voice-page voice-page-state" aria-live="polite"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" /><p>{text}</p></main>;
}

function UnavailableScreen() {
  return <main className="voice-page voice-page-state"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" /><h1>この声のページは<br />現在ご利用いただけません。</h1><p>QRコードをもう一度読み取っても表示されない場合は、運営窓口へご連絡ください。</p><a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("声のページについて")}`}>運営へ問い合わせる</a></main>;
}
