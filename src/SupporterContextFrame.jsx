import React, { useState } from 'react';
import { House } from 'lucide-react';
import './supporter-context.css';

// Shared by the real supporter journey and the read-only customer preview.
export default function SupporterContextFrame({ name, role, children, onReturn, returnDisabled = false, embedded = false, headerOnly = false }) {
  const [confirmReturn, setConfirmReturn] = useState(false);
  const storyLabel = `${name || 'ご家族'}の物語`;
  const roleLabel = role === 'facilitator' ? '制作管理中'
    : role === 'co_manager' ? '共同管理中' : 'お手伝い中';
  const header = <>
    <div className="family-supporter-context">
      <div className="family-supporter-context-inner">
        <button type="button" className="family-supporter-context-return" onClick={() => setConfirmReturn(true)} disabled={returnDisabled} aria-label="自分のホームへ戻る">
          <House size={16} strokeWidth={1.8} aria-hidden="true"/><span>自分のホームへ</span>
        </button>
        <span className="family-supporter-context-name" title={storyLabel}>{storyLabel}</span>
        <span className="family-supporter-context-badge">{roleLabel}</span>
      </div>
    </div>
    {confirmReturn && <div className="family-supporter-return-overlay" role="presentation">
      <div className="family-supporter-return-dialog" role="dialog" aria-modal="true" aria-labelledby="supporter-return-title" aria-describedby="supporter-return-description">
        <h2 id="supporter-return-title">自分のホームへ戻りますか？</h2>
        <p id="supporter-return-description">入力中の内容がある場合は、保存してから戻ってください。</p>
        <button type="button" className="family-supporter-return-stay" autoFocus onClick={() => setConfirmReturn(false)}>この物語にとどまる</button>
        <button type="button" className="family-supporter-return-confirm" onClick={() => { setConfirmReturn(false); onReturn?.(); }}>自分のホームへ戻る</button>
      </div>
    </div>}
  </>;
  if (headerOnly) return header;
  return <div className={`family-supporter-frame${embedded ? ' family-supporter-frame--embedded' : ''}`}>
    {header}
    {children}
  </div>;
}
