import React, { useCallback, useEffect, useRef, useState } from 'react';
import WebBook from './WebBook.jsx';

const accessKey = publicId => `tateyoko.voice.${publicId}.access.v1`;

function readAccess(publicId) {
  try { return JSON.parse(localStorage.getItem(accessKey(publicId)) || '{}'); }
  catch { return {}; }
}

// The printed QR identifies a publication. Its reader deliberately shares the
// exact presentation component used by the administrator's draft preview.
export default function PublishedWebBook({ supabaseClient, publicId }) {
  const [state, setState] = useState({ status: 'loading', publication: null, invalidCode: false });
  const [code, setCode] = useState('');
  const assetCache = useRef(new Map());

  const load = useCallback(async (accessCode = '') => {
    setState(previous => ({ ...previous, status: 'loading' }));
    const { data, error } = await supabaseClient.functions.invoke('public-voice', {
      body: { publicId, accessCode, accessToken: readAccess(publicId).token || '' }
    });
    if (!error && data?.codeRequired) {
      setState({ status: 'locked', publication: null, invalidCode: Boolean(data.invalidCode) });
      return;
    }
    if (error || !data?.success || !data.publication) {
      setState({ status: 'unavailable', publication: null, invalidCode: false });
      return;
    }
    if (data.accessToken) {
      localStorage.setItem(accessKey(publicId), JSON.stringify({ token: data.accessToken }));
    }
    assetCache.current.clear();
    setState({ status: 'ready', publication: data.publication, invalidCode: false });
  }, [publicId, supabaseClient]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex,nofollow,noarchive';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  const resolveAsset = useCallback(async ({ kind, itemOrder, assetIndex, videoIndex }) => {
    const key = kind.startsWith('video') ? `${kind}:${videoIndex}` : `${kind}:${itemOrder}:${assetIndex}`;
    const cached = assetCache.current.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const { data, error } = await supabaseClient.functions.invoke('public-voice', {
      body: { action: 'asset', publicId, kind, itemOrder, assetIndex, videoIndex,
        accessToken: readAccess(publicId).token || '' }
    });
    if (error || !data?.success || !data.asset?.url) throw Error('素材を取得できませんでした。');
    const lifetime = Math.max(30, Number(data.asset.expiresInSeconds || 0) - 60);
    assetCache.current.set(key, { url: data.asset.url, expiresAt: Date.now() + lifetime * 1000 });
    return data.asset.url;
  }, [publicId, supabaseClient]);

  if (state.status === 'ready') {
    return <WebBook publication={state.publication} resolveAsset={resolveAsset} />;
  }
  return <main className="wb wb-message">
    {state.status === 'loading' && <p role="status">Webブックを読み込んでいます…</p>}
    {state.status === 'locked' && <form onSubmit={event => { event.preventDefault(); load(code); }}>
      <h1>合言葉を入力してください</h1>
      <input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="off" aria-label="合言葉" />
      {state.invalidCode && <p role="alert">合言葉を確認してください。</p>}
      <button type="submit">Webブックを開く</button>
    </form>}
    {state.status === 'unavailable' && <><h1>Webブックを開けませんでした</h1>
      <p>時間をおいて、もう一度お試しください。</p><button type="button" onClick={() => load()}>再読み込み</button></>}
  </main>;
}
