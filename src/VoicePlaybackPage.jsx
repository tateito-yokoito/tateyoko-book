import React, { useEffect, useState } from "react";
import "./voice-playback.css";

const SUPPORT_EMAIL = "sugawara@saltlight.co.jp";

export default function VoicePlaybackPage({ supabaseClient, publicId }) {
  const [publication, setPublication] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;

    async function loadPublication() {
      setStatus("loading");
      const { data, error } = await supabaseClient.functions.invoke("public-voice", {
        body: { publicId }
      });
      if (!active) return;

      if (error || !data?.success || !data?.publication) {
        setPublication(null);
        setStatus("unavailable");
        return;
      }

      setPublication(data.publication);
      setStatus("ready");
    }

    loadPublication();
    return () => { active = false; };
  }, [publicId, supabaseClient]);

  useEffect(() => {
    document.body.classList.add("voice-page-active");
    return () => document.body.classList.remove("voice-page-active");
  }, []);

  if (status === "loading") {
    return (
      <main className="voice-page voice-page-state" aria-live="polite">
        <img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" />
        <p>声のページをひらいています。</p>
      </main>
    );
  }

  if (status !== "ready") {
    return (
      <main className="voice-page voice-page-state">
        <img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" />
        <h1>この声のページは<br />現在ご利用いただけません。</h1>
        <p>QRコードをもう一度読み取っても表示されない場合は、運営窓口へご連絡ください。</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("声のページについて")}`}>運営へ問い合わせる</a>
      </main>
    );
  }

  return (
    <main className="voice-page">
      <header className="voice-page-header">
        <a href="/" aria-label="縦糸横糸 トップへ">
          <img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" />
        </a>
      </header>

      <section className="voice-page-intro">
        <p className="voice-page-kicker">VOICE ARCHIVE</p>
        <h1>{publication.title || "残された声"}</h1>
        {publication.subtitle && <p className="voice-page-subtitle">{publication.subtitle}</p>}
        {publication.subjectName && <p className="voice-page-subject">語り手　{publication.subjectName}</p>}
      </section>

      <section className="voice-page-stories" aria-label="声の一覧">
        {publication.items.map((item, index) => (
          <article className="voice-story" key={`${item.order}-${index}`}>
            <div className="voice-story-heading">
              <p>{item.chapterTitle || `語り ${index + 1}`}</p>
              {item.question && <h2>{item.question}</h2>}
            </div>

            <div className="voice-story-audio">
              {item.audio.map((asset, audioIndex) => (
                <div className="voice-audio-part" key={`${item.order}-${audioIndex}`}>
                  {item.audio.length > 1 && <span>音声 {audioIndex + 1}</span>}
                  <audio controls preload="metadata" src={asset.url}>
                    お使いのブラウザは音声再生に対応していません。
                  </audio>
                </div>
              ))}
            </div>

            {item.transcript && (
              <details className="voice-story-transcript">
                <summary>文章でも読む</summary>
                <p>{item.transcript}</p>
              </details>
            )}
          </article>
        ))}
      </section>

      <footer className="voice-page-footer">
        <img src="/brand-logo-symbol.svg" alt="" />
        <p>声を、本にする。</p>
      </footer>
    </main>
  );
}
