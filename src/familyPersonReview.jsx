import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FamilyPersonPage from './FamilyPersonPage.jsx';
import './family-home-review.css';

// Visual review renders the exact person component used by FamilyPlaceApp.
// These browser-only fixtures are never written to TEST or production data.
function Review() {
  const params = new URLSearchParams(location.search);
  const capture = params.has('capture');
  const [state, setState] = useState(params.get('state') || 'empty');
  const [tab, setTab] = useState('life');
  const [notice, setNotice] = useState('');
  const person = { id: 'preview-person', display_name: '山田 太郎',
    birth_year: state === 'empty' ? null : 1935,
    notes: state === 'empty' ? '' : '家族と過ごす時間を大切にしてきました。' };
  const questions = [
    { id: 'q1', slot: 1, text: '子どもの頃、どんな場所で過ごしましたか？' },
    { id: 'q2', slot: 2, text: '小さい頃に好きだった遊びは何ですか？' },
    { id: 'q3', slot: 3, text: '日々の中で楽しみにしている時間や出来事はありますか？' },
  ];
  const stories = state === 'empty' ? [] : [
    { id: 's1', question_slot: 1, question_text: questions[0].text, body: '架空のプレビュー用回答', visibility: 'family' },
    { id: 's2', question_slot: 2, question_text: questions[1].text, body: '架空のプレビュー用回答', visibility: 'private' },
  ];
  const facts = state === 'empty' ? [] : [
    { id: 'birth-year', year: 1935, label: '誕生', detail: '' },
    { id: 'school', year: 1951, label: '学校を卒業', detail: '' },
  ];
  return <div className={`fp-review-stage${capture ? ' is-capture' : ''}`}>
    {!capture && <div className="fp-review-controls"><strong>人物ページ｜スマホ基準 390 × 844</strong>
      <label>表示状態 <select aria-label="レビュー状態" value={state} onChange={event=>{setState(event.target.value);setTab('life');}}>
        <option value="empty">人物登録直後</option><option value="stories">記録あり</option>
      </select></label></div>}
    <div className="fp-review-phone">
      <FamilyPersonPage person={person} stories={stories} facts={facts} questions={questions}
        activeTab={tab} onTabChange={setTab}
        onBack={()=>setNotice('実アプリでは家族ホームへ戻ります。')}
        onProfile={()=>setNotice('実アプリではプロフィール編集画面を開きます。')}
        onOpenStory={()=>setNotice('実アプリでは既存の回答UIを開きます。')}
        onAddFact={()=>setNotice('実アプリでは出来事の登録画面を開きます。')}/>
      {notice && <div className="fp-review-notice" role="status" onClick={()=>setNotice('')}>{notice}</div>}
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<Review/>);
