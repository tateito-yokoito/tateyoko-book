import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnswerEntryChoices, AnswerBodyEditor, AnswerReview, AnswerSaveStatus } from '../AnswerInputUI.jsx';
import '../index.css';

// Visual fixture only. Product screens import the same components and supply
// their own BOOK/seasonal persistence adapters; this page makes no API calls.
function Review() {
  const [product, setProduct] = useState('BOOK');
  const [screen, setScreen] = useState('entry');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (!body && !photo) return;
    setSaveState('saving');
    const timer = setTimeout(() => setSaveState('saved'), 600);
    return () => clearTimeout(timer);
  }, [body, photo]);
  const photos = photo ? [{ id: 'sample', url: '/site/hp-renewal/nenrin/autumn-album.jpg' }] : [];
  const choosePhoto = () => { setPhoto(true); setScreen('review'); };
  return <main className="answer-light" style={{minHeight:'100dvh',padding:'22px 18px 90px'}}>
    <div style={{maxWidth:440,margin:'0 auto'}}>
      <p style={{fontSize:13,color:'#53665b'}}>画面デザインのレビュー用・架空データ・保存は疑似動作</p>
      <div style={{display:'flex',gap:8,margin:'20px 0'}}>
        {['BOOK','季節の記憶箱'].map(item => <button key={item} type="button" onClick={() => {setProduct(item);setScreen('entry');setCompleted(false)}}
          style={{minHeight:44,border:'1px solid #aabbb0',borderRadius:8,padding:'0 14px',background:item===product?'#dfe9df':'#fffdf8',color:'#284c40'}}>{item}</button>)}
      </div>
      <p style={{fontSize:14,color:'#8d5c48'}}>{product === 'BOOK' ? '幼い頃　1 / 26' : '人生をもう少し語る'}</p>
      <h1 style={{fontFamily:'Noto Serif JP,serif',fontSize:27,lineHeight:1.6,margin:'14px 0 22px'}}>幼い頃、どんなところに住んでいましたか？</h1>
      {completed ? <div>この問いを終えました。<button type="button" onClick={() => {setCompleted(false);setScreen('review')}}>回答に戻る</button></div>
      : screen === 'entry' ? <AnswerEntryChoices onVoice={() => setScreen('voice')} onWrite={() => setScreen('write')} onPhoto={choosePhoto}/>
      : screen === 'write' ? <>
          {photos.length > 0 && <img src={photos[0].url} alt="添えた写真" style={{width:88,height:78,objectFit:'cover'}}/>}
          <AnswerBodyEditor value={body} onChange={setBody}/>
          <AnswerSaveStatus state={saveState} hasContent={Boolean(body)}/>
          <button className="answer-review__finish" type="button" onClick={() => setScreen('review')}>回答を確認する</button>
        </>
      : screen === 'voice' ? <div style={{padding:'24px 0'}}>
          <p>録音操作は既存アプリの部品を使用します。この画面ではマイクを使いません。</p>
          <button className="answer-review__finish" type="button" onClick={() => setScreen('review')}>回答を確認する</button>
        </div>
      : <AnswerReview body={body} photos={photos} saveState={saveState}
          onVoice={() => setScreen('voice')} onWrite={() => setScreen('write')} onPhoto={choosePhoto}
          onFinish={() => setCompleted(true)} canFinish={saveState === 'saved' && Boolean(body || photo)}
          finishLabel={product === 'BOOK' ? 'この問いを終える' : 'この記録を終える'} />}
      {screen !== 'entry' && !completed && <button type="button" onClick={() => setScreen('entry')}
        style={{marginTop:24,minHeight:44,color:'#284c40',textDecoration:'underline'}}>回答の入口へ戻る</button>}
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<Review/>);
