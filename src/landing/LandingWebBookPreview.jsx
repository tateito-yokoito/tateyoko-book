import React, { useRef, useState } from "react";

// HP-only excerpt of VoicePlaybackPage's photo / transcript / audio-console design.
// No customer publication, authentication, API, or persistent playback history is used.
const formatTime = value => Math.floor(value / 60) + ":" + String(Math.floor(value % 60)).padStart(2, "0");

export default function LandingWebBookPreview() {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [error, setError] = useState(false);
  const seek = value => { if (audio.current && duration) { audio.current.currentTime = Math.min(duration, Math.max(0, value)); setTime(audio.current.currentTime); } };
  const toggle = async () => {
    if (playing) { audio.current.pause(); return; }
    setError(false);
    try { await audio.current.play(); } catch { setError(true); }
  };
  return <section className="hp-webbook-demo" aria-label="Webブックの一つの語り・表示見本">
    <header><img src="/brand-logo-symbol.svg" alt="" width="26" height="26" /><span>縦糸横糸Webブック</span><span className="hp-demo-badge">見本</span></header>
    <div className="hp-demo-body"><p className="hp-demo-theme">幼い頃</p><h3>幼い頃、どんなところに<br />住んでいましたか？</h3>
      <figure><img src="/site/hajimari-doorway-v2.jpg" alt="語りに添える写真の見本・庭へ続く戸口" loading="lazy" width="1200" height="800" /></figure>
      <p className="hp-demo-words">家の前には、小さな川が流れていました。<br />夕方になると、母の呼ぶ声が聞こえてきたことを覚えています。</p>
      <div className="hp-demo-console">
        <audio ref={audio} src="/site/hp-renewal/sample-voice.wav" preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onDurationChange={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onError={() => { setError(true); setPlaying(false); }} />
        <div className="hp-demo-transport"><button aria-label="15秒戻る" onClick={() => seek(time - 15)} disabled={!duration}>−15</button><button className="hp-demo-play" onClick={toggle} aria-label={playing ? "音声を一時停止する" : "サンプル音声を聴く"}><span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playing ? "一時停止" : "声を聴く"}</button><button aria-label="15秒進む" onClick={() => seek(time + 15)} disabled={!duration}>＋15</button></div>
        <label className="hp-demo-timeline"><span className="hp-sr-only">再生位置</span><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(time,duration || 1)} disabled={!duration} onChange={e => seek(Number(e.target.value))} /><span>{formatTime(time)} / {formatTime(duration)}</span></label>
        {error && <p role="status">音声を再生できませんでした。もう一度「声を聴く」を押してください。</p>}
      </div>
      <p className="hp-demo-disclosure">実UIをもとにした表示見本。文章は架空、写真はイメージです。音声は約7秒の合成音声で、上の文章とは別のサンプルです。</p>
    </div>
  </section>;
}

