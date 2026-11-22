import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FamilyHome, { FamilyHomeNav } from './FamilyHome.jsx';
import './family-home-review.css';

// Isolated visual review of the exact home component used in FamilyPlaceApp.
// Sample people here are browser-only fixtures and are never saved to the DB.
function Review() {
  const params = new URLSearchParams(location.search);
  const capture = params.has('capture');
  const [state, setState] = useState(params.get('state') || 'empty');
  const [notice, setNotice] = useState('');
  const people = state === 'empty' ? [] : [{ id: 'preview-person', display_name: '山田 太郎' }];
  const storyCounts = state === 'stories' ? { 'preview-person': 2 } : {};
  return <div className={`fp-review-stage${capture ? ' is-capture' : ''}`}>
    {!capture && <div className="fp-review-controls">
      <strong>家族ホーム｜スマホ基準 390 × 844</strong>
      <label>表示状態 <select aria-label="レビュー状態" value={state} onChange={event=>setState(event.target.value)}>
        <option value="empty">初回・空</option><option value="person">人物登録済み</option><option value="stories">記録あり</option>
      </select></label>
    </div>}
    <div className="fp-review-phone">
      <FamilyHome people={people} storyCounts={storyCounts}
        onAddPerson={() => setNotice('実アプリでは、人物登録画面を開きます。')}
        onOpenPerson={() => setNotice('実アプリでは、この人物のページを開きます。')}/>
      <FamilyHomeNav onHome={() => setNotice('ホームを表示中です。')}
        onStories={() => setNotice('実アプリでは人生の物語へ進みます。')}
        onFamily={() => setNotice('実アプリでは家族の人物一覧へ進みます。')}/>
      {notice && <div className="fp-review-notice" role="status" onClick={()=>setNotice('')}>{notice}</div>}
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<Review/>);
