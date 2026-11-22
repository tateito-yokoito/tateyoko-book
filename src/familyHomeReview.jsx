import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FamilyHome, { FamilyHomeNav } from './FamilyHome.jsx';

// Isolated visual review of the exact home component used in FamilyPlaceApp.
// Sample people here are browser-only fixtures and are never saved to the DB.
function Review() {
  const params = new URLSearchParams(location.search);
  const [state, setState] = useState(params.get('state') || 'empty');
  const [notice, setNotice] = useState('');
  const people = state === 'empty' ? [] : [{ id: 'preview-person', display_name: '山田 太郎' }];
  const storyCounts = state === 'stories' ? { 'preview-person': 2 } : {};
  return <>
    <FamilyHome people={people} storyCounts={storyCounts}
      onAddPerson={() => setNotice('実アプリでは、人物登録画面を開きます。')}
      onOpenPerson={() => setNotice('実アプリでは、この人物のページを開きます。')}/>
    <FamilyHomeNav onHome={() => setNotice('ホームを表示中です。')}
      onStories={() => setNotice('実アプリでは人生の物語へ進みます。')}
      onFamily={() => setNotice('実アプリでは家族の人物一覧へ進みます。')}/>
    {!params.has('capture') && <aside style={{position:'fixed',top:2,right:2,zIndex:10,fontSize:11,background:'#fff8',borderRadius:7,padding:3}}>
      <label>レビュー状態 <select aria-label="レビュー状態" value={state} onChange={event=>setState(event.target.value)}>
        <option value="empty">初回・空</option><option value="person">人物登録済み</option><option value="stories">記録あり</option>
      </select></label>
    </aside>}
    {notice && <div role="status" onClick={()=>setNotice('')} style={{position:'fixed',bottom:68,left:12,right:12,zIndex:10,padding:12,borderRadius:10,background:'#314d24',color:'white',fontSize:13}}>{notice}</div>}
  </>;
}

createRoot(document.getElementById('root')).render(<Review/>);
