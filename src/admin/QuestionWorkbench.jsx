import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {Scene1_MyPage} from '../App.jsx';
import BookendInvitation from '../BookendInvitation.jsx';
import {STORY_THEMES} from '../lib/storyThemes.js';
import {THEME_EXTRA_QUESTIONS} from '../lib/themeExtras.js';
import {BOOKEND_PROMPTS} from '../lib/bookends.js';
import './question-workbench.css';

const themeByCode = Object.fromEntries(STORY_THEMES.map(theme => [theme.code, theme]));

export function questionWorkbenchRows(base = [], edits = []) {
  const editByKey = Object.fromEntries(edits.map(edit => [edit.key, edit]));
  const rows = base.map(item => ({
    ...item,
    kind: item.group === 'trial_experience' ? 'trial' : item.theme_code ? 'basic' : 'opening',
    section: item.group === 'trial_experience' ? '無料の3問' : themeByCode[item.theme_code]?.label || 'はじまりの章',
    sortOrder: item.group === 'trial_experience' ? Number(item.order)-9010
      : item.theme_code ? (themeByCode[item.theme_code]?.order || 9)*100+Number(item.order)/100
      : 10+Number(item.order),
  }));
  rows.push(...['intro', 'outro'].map((kind, index) => ({
    key: `bookend:${kind}`, id: kind, kind: 'bookend', order: index ? 10000 : 9000,
    section: BOOKEND_PROMPTS[kind].label, text: BOOKEND_PROMPTS[kind].text, hint: '短くても大丈夫です。',
    sortOrder: index ? 1000 : 20,
  })));
  STORY_THEMES.forEach(theme => {
    (THEME_EXTRA_QUESTIONS[theme.code] || []).forEach(([id, text], index) => rows.push({
      key: `extra:${id}`, id, kind: 'extra', order: theme.order * 100 + index,
      theme_code: theme.code, section: theme.label, text, hint: '', sortOrder:theme.order*100+50+index,
    }));
    const id = `free-${theme.code.replaceAll('_', '-')}`;
    rows.push({key:`extra:${id}`,id,kind:'free',order:theme.order*100+99,
      theme_code:theme.code,section:theme.label,text:`「${theme.label}」について気ままに語る`,hint:'',sortOrder:theme.order*100+99});
  });
  return rows.sort((a,b)=>a.sortOrder-b.sortOrder).map(row => ({...row,
    publishedText: editByKey[row.key]?.published_text ?? row.text,
    publishedHint: editByKey[row.key]?.published_hint ?? row.hint,
    draftText: editByKey[row.key]?.draft_text ?? null,
    draftHint: editByKey[row.key]?.draft_hint ?? null,
    hasUnpublishedDraft: Boolean(editByKey[row.key] && (
      editByKey[row.key].draft_text !== editByKey[row.key].published_text ||
      editByKey[row.key].draft_hint !== editByKey[row.key].published_hint
    )),
  }));
}

function customerQuestion(row, draft = false) {
  return {
    id: row.id, question_id: row.id, status:'pending',
    content: draft && row.draftText !== null ? row.draftText : row.publishedText,
    prompt_hint: draft && row.draftHint !== null ? row.draftHint : row.publishedHint,
    chapter_label: row.section, chapter: row.section,
    onboarding_group: row.kind === 'trial' ? 'trial_experience' : null,
    theme_code: row.theme_code, theme_order: themeByCode[row.theme_code]?.order,
  };
}

export default function QuestionWorkbench({client, owner = false, onOpenCustomerExperience}) {
  const [base,setBase]=useState([]),[edits,setEdits]=useState([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const [selected,setSelected]=useState(null),[text,setText]=useState(''),[hint,setHint]=useState(''),[busy,setBusy]=useState(false);
  const [preview,setPreview]=useState(null),[previewDraft,setPreviewDraft]=useState(false);
  const rows=useMemo(()=>questionWorkbenchRows(base,edits),[base,edits]);
  const visible=useMemo(()=>rows.filter(row =>
    (filter === 'all' || filter === row.kind || filter === row.theme_code) &&
    (!search.trim() || `${row.section} ${row.publishedText} ${row.publishedHint} ${row.id}`.includes(search.trim()))
  ),[rows,filter,search]);
  const active=rows.find(row=>row.key===selected);
  const previewRow=rows.find(row=>row.key===preview);
  const refresh=async()=>{
    setLoading(true);setError('');
    try{const {data,error:loadError}=await client.rpc('admin_question_workbench');if(loadError)throw loadError;
      setBase(data?.base||[]);setEdits(data?.edits||[]);
    }catch(e){setError(e?.message||'質問一覧を読み込めませんでした。');}
    finally{setLoading(false);}
  };
  useEffect(()=>{refresh();},[client]);
  const openEdit=row=>{setSelected(row.key);setText(row.draftText??row.publishedText);setHint(row.draftHint??row.publishedHint);setNotice('');};
  const save=async()=>{
    if(!active||busy)return;setBusy(true);setError('');setNotice('');
    try{const {error:saveError}=await client.rpc('admin_save_question_draft',{input_key:active.key,input_text:text,input_hint:hint});
      if(saveError)throw saveError;await refresh();setNotice('下書きを保存しました。');
    }catch(e){setError(e?.message||'下書きを保存できませんでした。');}finally{setBusy(false);}
  };
  const publish=async()=>{
    if(!active||busy||!owner||!active.hasUnpublishedDraft)return;setBusy(true);setError('');setNotice('');
    try{const {error:publishError}=await client.rpc('admin_publish_question_draft',{input_key:active.key});
      if(publishError)throw publishError;await refresh();setNotice('公開しました。回答済みの語りは変更されません。');
    }catch(e){setError(e?.message||'公開できませんでした。');}finally{setBusy(false);}
  };
  const previewIndex=visible.findIndex(row=>row.key===preview);
  const previewQuestion=previewRow&&customerQuestion(previewRow,previewDraft);
  if(previewQuestion&&previewDraft&&active?.key===previewRow.key){previewQuestion.content=text;previewQuestion.prompt_hint=hint;}
  return <div className="question-workbench">
    <div className="qw-heading"><div><p className="qw-eyebrow">QUESTION & EXPERIENCE</p><h3>質問・顧客体験</h3><p>質問とヒントを一覧で読み、画面を確かめながら編集できます。</p></div>
      <button type="button" onClick={()=>window.print()} className="qw-print">一覧を印刷・PDF保存</button></div>
    {onOpenCustomerExperience&&<button type="button" className="qw-experience-link" onClick={onOpenCustomerExperience}>実際の顧客体験を見る → <small>物語を選んで、保存済みの画面を確認</small></button>}
    <div className="qw-toolbar"><select aria-label="表示するテーマ" value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="all">すべて</option><option value="trial">無料の3問</option><option value="opening">はじまりの章</option><option value="bookend">はじめに・あとがき</option>
      {STORY_THEMES.map(theme=><option key={theme.code} value={theme.code}>{theme.order}. {theme.label}</option>)}
      <option value="extra">追加質問</option><option value="free">自由に語る</option>
    </select><input aria-label="質問を検索" placeholder="質問・ヒントを検索" value={search} onChange={e=>setSearch(e.target.value)}/>
      <button type="button" onClick={refresh}>再読み込み</button></div>
    {notice&&<p className="qw-notice" role="status">{notice}</p>}{error&&<p className="qw-error" role="alert">{error}</p>}
    {loading?<p className="qw-loading">質問を読み込んでいます…</p>:<>
      <p className="qw-count">{visible.length}件を表示中</p>
      <div className="qw-list">{visible.map(row=><article className="qw-row" key={row.key}>
        <div className="qw-meta"><span>{row.section}</span><span>{row.kind==='trial'?'無料':row.kind==='basic'?'基本':row.kind==='extra'?'追加':row.kind==='free'?'自由':'任意'}</span><code>{row.id}</code>{row.hasUnpublishedDraft&&<strong>下書きあり</strong>}</div>
        <h4>{row.publishedText}</h4><p className="qw-hint">{row.publishedHint||'ヒントなし'}</p>
        <div className="qw-actions"><button type="button" onClick={()=>openEdit(row)}>編集</button><button type="button" onClick={()=>{setPreview(row.key);setPreviewDraft(false);}}>顧客画面で見る</button></div>
      </article>)}</div>
    </>}
    {active&&<div className="qw-editor-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="qw-editor" role="dialog" aria-modal="true" aria-label="質問を編集">
      <div className="qw-editor-head"><div><small>{active.section} · {active.id}</small><h3>質問とヒントを編集</h3></div><button type="button" onClick={()=>setSelected(null)} aria-label="閉じる">×</button></div>
      <label>質問<textarea value={text} onChange={e=>setText(e.target.value)} rows="4" maxLength="500"/></label>
      <label>ヒント<textarea value={hint} onChange={e=>setHint(e.target.value)} rows="3" maxLength="600"/></label>
      <p>下書き保存後に顧客画面を確認し、公開できます。回答済みの語りは変わりません。</p>
      <div className="qw-editor-actions"><button type="button" onClick={save} disabled={busy||text.trim().length<4}>下書きを保存</button>
        <button type="button" onClick={()=>{setPreview(active.key);setPreviewDraft(true);}} disabled={busy}>下書きを画面で見る</button>
        {owner&&<button type="button" className="qw-publish" onClick={publish} disabled={busy||!active.hasUnpublishedDraft}>保存済みの下書きを公開</button>}</div>
    </section></div>}
    {previewRow&&createPortal(<div className="qw-preview" role="dialog" aria-modal="true" aria-label="顧客画面プレビュー">
      <header><span>{previewDraft?'下書きの表示':'公開中の表示'} · 保存操作はありません</span><button onClick={()=>setPreview(null)}>閉じる</button></header>
      <div className="qw-phone">{previewRow.kind==='bookend'
        ? <BookendInvitation kind={previewRow.id} promptOverride={{label:previewRow.section,text:previewQuestion.content,hint:previewQuestion.prompt_hint}} busy onVideo={()=>{}} onVoice={()=>{}} onSkip={()=>{}}/>
        : <Scene1_MyPage question={previewQuestion} userName="あなた" progress={{currentIndex:Math.max(0,previewIndex),total:visible.length}} onNext={()=>{}} onSkip={()=>{}} onEndToday={()=>{}}/>}</div>
      <footer><button disabled={previewIndex<=0} onClick={()=>setPreview(visible[previewIndex-1]?.key)}>前の問い</button><span>{previewIndex+1} / {visible.length}</span><button disabled={previewIndex>=visible.length-1} onClick={()=>setPreview(visible[previewIndex+1]?.key)}>次の問い</button></footer>
    </div>,document.body)}
  </div>;
}
