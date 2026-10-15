import React from 'react';
import { House } from 'lucide-react';
import './supporter-context.css';

// Shared by the real supporter journey and the read-only customer preview.
export default function SupporterContextFrame({ name, children, onReturn, returnDisabled = false, embedded = false }) {
  const storyLabel = `物語：${name || 'ご家族'}`;
  return <div className={`family-supporter-frame${embedded ? ' family-supporter-frame--embedded' : ''}`}>
    <div className="family-supporter-context">
      <div className="family-supporter-context-inner">
        <button type="button" className="family-supporter-context-return" onClick={onReturn} disabled={returnDisabled} aria-label="自分のホームへ戻る">
          <House size={16} strokeWidth={1.8} aria-hidden="true"/><span>自分へ</span>
        </button>
        <span className="family-supporter-context-badge">お手伝い中</span>
        <span className="family-supporter-context-name" title={storyLabel}>{storyLabel}</span>
      </div>
    </div>
    {children}
  </div>;
}
