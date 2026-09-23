import React, { useEffect, useRef, useState } from 'react';
import WebBook from './WebBook.jsx';
import { snapshotToWebBook } from './lib/webBook.js';

export default function WebBookPage({ client, publicId, projectId, onClose, adminPreview = false, reviewTargetId = null }) {
  const [publication,setPublication]=useState(null), [state,setState]=useState('loading'), [code,setCode]=useState(''), [error,setError]=useState('');
  const access = useRef(''), generation = useRef(0);
  const load = async () => {
    const request=++generation.current;
    setState('loading');setError('');
    try {
      if(!projectId) {try {access.current=sessionStorage.getItem(`webbook.${publicId}`)||'';}catch{}}
      const {data,error:failure}=await client.functions.invoke(projectId?'web-book-preview':'public-voice',{
        body:projectId?{projectId}:{publicId,accessCode:code,accessToken:access.current,reviewTargetId}
      });
      if(request!==generation.current)return;
      if(data?.codeRequired){setState('locked');setError(data.invalidCode?'合言葉をご確認ください。':'');return;}
      if(failure||!data?.success)throw Error('このWebブックを開けませんでした。権限と公開状態をご確認ください。');
      if(data.accessToken){access.current=data.accessToken;try{sessionStorage.setItem(`webbook.${publicId}`,data.accessToken);}catch{}}
      setPublication(projectId?snapshotToWebBook(data.snapshot):data.publication);
      setState('ready');
    } catch(e){if(request===generation.current){setState('error');setError(e.message);}}
  };
  useEffect(()=>{load();return()=>{generation.current++;};},[publicId,projectId,reviewTargetId,client]);
  useEffect(()=>{const meta=document.createElement('meta');meta.name='robots';meta.content='noindex,nofollow,noarchive';document.head.appendChild(meta);return()=>meta.remove();},[]);
  const resolveAsset=async params=>{
    if(projectId)throw Error('プレビュー素材を取得できませんでした。開き直してください。');
    const {data,error}=await client.functions.invoke('public-voice',{body:{...params,action:'asset',publicId,accessToken:access.current,reviewTargetId}});
    if(error||!data?.asset?.url)throw Error('再生できませんでした。');
    return data.asset.url;
  };
  if(state!=='ready')return <div className="wb"><section className="wb-message"><h1>縦糸横糸 Webブック</h1>{state==='loading'?<p role="status">開いています…</p>:state==='locked'?<form onSubmit={e=>{e.preventDefault();load();}}><label>合言葉<input type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off"/></label><button>開く</button></form>:<button onClick={load}>もう一度確認する</button>}{error&&<p role="alert">{error}</p>}{onClose&&<button onClick={onClose}>戻る</button>}</section></div>;
  return <>{projectId&&adminPreview&&<div className="wb-preview"><span>制作中 Webブック｜管理者プレビュー — 現在の制作データを表示しています</span><button type="button" onClick={load}>↻ 再読み込み</button></div>}<WebBook publication={publication} resolveAsset={resolveAsset} onClose={onClose}/></>;
}
