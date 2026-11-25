import React, { useEffect, useState } from 'react';
import { bookFamilyAccess, validPublicBookId } from './lib/bookFamilyAccess.js';
import './book-family-gateway.css';

export default function BookFamilyGateway({ client, publicId }) {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let live = true;
    if (!validPublicBookId(publicId)) { setStatus('unavailable'); return undefined; }
    const check = async () => {
      const result = await bookFamilyAccess(client, publicId);
      if (!live) return;
      if (result.status === 'allowed') {
        window.location.replace(`/app?tab=books&publication=${encodeURIComponent(publicId)}`);
      } else setStatus(result.status);
    };
    void check();
    const { data } = client.auth.onAuthStateChange(() => { void check(); });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, [client, publicId]);

  return <main className="book-family-gateway">
    <div className="book-family-gateway-inner">
      <p className="book-family-gateway-brand">縦糸∞横糸</p>
      {status === 'checking' ? <p role="status">家族のページを確認しています…</p>
        : status === 'unavailable' ? <><h1>家族のページを開けませんでした</h1>
          <a href="/app">家族アプリへ</a></>
        : status === 'signed-out' ? <>
          <h1>家族のページへ</h1>
          <p>このBOOKは、家族の人生を残し、育んでいく『たて糸♾️よこ糸』から生まれました。</p>
          <div className="book-family-gateway-actions">
            <a href={`/login?return_book=${encodeURIComponent(publicId)}`}>無料で始める</a>
            <a href={`/login?return_book=${encodeURIComponent(publicId)}`}>ログイン</a>
          </div>
        </> : <>
          <h1>あなたの家族のページへ</h1>
          <p>このBOOKの家族情報は、参加している方だけが閲覧できます。</p>
          <a href="/app">自分の家族アプリを開く</a>
        </>}
    </div>
  </main>;
}
