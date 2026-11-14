import React from 'react';
import { Camera, Mic, Pencil } from 'lucide-react';
export { canCompleteSavedAnswer, bookTextSaveState } from './lib/answerSaveState.js';
import './answer-input-ui.css';

// The same presentation is used by BOOK answers and seasonal records. The
// caller owns navigation, persistence, permissions and completion rules.
export function AnswerEntryChoices({ onVoice, onWrite, onPhoto, photoDisabled = false }) {
  return <div className="answer-entry-choices" role="group" aria-label="回答方法">
    <button type="button" disabled={!onVoice} onClick={onVoice}><Mic aria-hidden="true"/>声で語る</button>
    <button type="button" disabled={!onWrite} onClick={onWrite}><Pencil aria-hidden="true"/>書き込む</button>
    <button type="button" className="answer-entry-choices__photo" disabled={photoDisabled || !onPhoto} onClick={onPhoto}>
      <Camera aria-hidden="true"/>写真を添える
    </button>
  </div>;
}
export function AnswerPhotoStrip({ photos = [], onOpen, onRemove, label = '添えた写真' }) {
  if (!photos.length) return null;
  return <div className="answer-photo-strip" aria-label={label}>
    {photos.map((photo, index) => <span key={photo.id || photo.url || index} className="answer-photo-strip__item">
      <button type="button" onClick={() => onOpen?.(photo, index)} aria-label={`写真 ${index + 1} を見る`}>
        <img src={photo.url} alt="" />
      </button>
      {onRemove && <button type="button" className="answer-photo-strip__remove"
        onClick={() => onRemove(photo, index)} aria-label={`写真 ${index + 1} を外す`}>×</button>}
    </span>)}
  </div>;
}

export function AnswerReview({ body = '', photos = [], audio = [], onOpenPhoto,
  onVoice, onWrite, onPhoto, saveState = 'idle', onRetry,
  onFinish, finishLabel = 'この問いを終える', canFinish = false, showChoices = true, children }) {
  return <div className="answer-review">
    {children}
    <AnswerPhotoStrip photos={photos} onOpen={onOpenPhoto} />
    {(body.trim() || audio.length > 0) && <div className="answer-review__summary">
      {body.trim() && <p>{body.slice(0, 180)}</p>}
      {audio.map((item, index) => <audio key={item.id || index} src={item.url} controls />)}
    </div>}
    {showChoices && <AnswerEntryChoices onVoice={onVoice} onWrite={onWrite} onPhoto={onPhoto} />}
    <AnswerSaveStatus state={saveState} onRetry={onRetry} hasContent={Boolean(body.trim() || photos.length || audio.length)} />
    <button type="button" className="answer-review__finish" disabled={!canFinish} onClick={onFinish}>{finishLabel}</button>
  </div>;
}

export function AnswerBodyEditor({ value, onChange, disabled = false, label = '回答の文章',
  placeholder = 'ここに思い出を書く', className = '' }) {
  return <textarea aria-label={label} value={value} disabled={disabled}
    onChange={event => onChange(event.target.value)} placeholder={placeholder}
    className={`answer-body-editor ${className}`} />;
}

export function AnswerSaveStatus({ state = 'idle', onRetry, message, hasContent = true }) {
  const labels = { saving: '保存中…', saved: '保存しました', failed: '保存できていません',
    conflict: '別の変更が見つかりました', device_only: 'この端末に下書きがあります', offline: '通信を確認してください' };
  const label = hasContent ? message || labels[state] || '' : '';
  if (!label) return null;
  return <div className={`answer-save-status answer-save-status--${state}`} role="status">
    <span>{label}</span>
    {state === 'failed' && onRetry && <button type="button" onClick={onRetry}>保存を再試行する</button>}
  </div>;
}
