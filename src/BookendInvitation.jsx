import React from "react";
import { Mic, Video } from "lucide-react";
import StorySkySurface from "./home/StorySkySurface.jsx";
import { bookendPrompt } from "./lib/bookends.js";

export default function BookendInvitation({ kind, onVideo, onVoice, onSkip, busy = false, promptOverride = null }) {
  const prompt = promptOverride || bookendPrompt(kind);
  if (!prompt) return null;

  return (
    <StorySkySurface className="question-flow-content bookend-question-flow h-full flex flex-col overflow-y-auto pb-4 fade-enter">
      <header className="question-flow-header mb-5 pt-2 text-left">
        <h1 className="sr-only">{prompt.label}の語り</h1>
        <p className="text-white/60 text-[1rem] tracking-widest">{prompt.label} · 任意</p>
        <div className="mt-2 h-[2px] w-full rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full bg-white/40" style={{ width: kind === "intro" ? "11%" : "100%" }} />
        </div>
      </header>

      <div className="reading-question">
        <div className="glass-card recording-question-card px-5 py-6 text-center">
          <p className="text-[1.1rem] text-white/90">{prompt.text}</p>
        </div>
        <aside className="recording-question-hint" aria-label="ヒント">
          <p>{prompt.hint}</p>
        </aside>
      </div>

      <div className="bookend-choice-area">
        <p className="bookend-video-meaning">声と一緒に、今の表情も残せます。</p>
        <button type="button" disabled={busy} onClick={onVideo} className="recording-start-bar">
          <Video size={21} strokeWidth={1.7} aria-hidden="true" />
          <span>ビデオで残す</span>
        </button>
        <p className="bookend-video-limit">ビデオは、はじめと終わりに1本ずつ（任意）</p>
        <button type="button" disabled={busy} onClick={onVoice} className="bookend-voice-button">
          <Mic size={21} strokeWidth={1.7} aria-hidden="true" />
          <span>声で残す</span>
        </button>
        <button type="button" disabled={busy} onClick={onSkip} className="bookend-skip-button">今は飛ばす</button>
        <p className="bookend-later-note">あとから「これまでの語り」で残せます。</p>
      </div>
    </StorySkySurface>
  );
}
