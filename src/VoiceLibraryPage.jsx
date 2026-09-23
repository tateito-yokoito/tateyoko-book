import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./voice-library.css";
import {isWebBookPin} from './lib/webBookPin.js';

const relationshipLabels = {
  owner: "自分の物語",
  purchased: "購入した物語",
  managed: "管理している物語",
  shared: "家族から共有された物語"
};

function formatPublishedAt(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

export default function VoiceLibraryPage({ supabaseClient, reviewContext = null }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [publications, setPublications] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (reviewContext) { setAuthReady(true); setStatus("ready"); setPublications(reviewContext.publications || []); return; }
    let mounted = true;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setAuthReady(true);
    });
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabaseClient, reviewContext]);

  const loadLibrary = useCallback(async () => {
    if (!session) return;
    setStatus("loading");
    setMessage("");
    const { data, error } = await supabaseClient.rpc("list_completed_web_book_library");
    if (error) {
      setStatus("error");
      setMessage("本棚を読み込めませんでした。時間をおいて、もう一度お試しください。");
      return;
    }
    setPublications(data || []);
    setStatus("ready");
  }, [session, supabaseClient]);

  useEffect(() => {
    if (reviewContext) return;
    if (authReady && session) loadLibrary();
    if (authReady && !session) setStatus("signed-out");
  }, [authReady, loadLibrary, session, reviewContext]);

  const grouped = useMemo(() => {
    return publications.reduce((result, publication) => {
      const key = publication.relationship || "shared";
      if (!result[key]) result[key] = [];
      result[key].push(publication);
      return result;
    }, {});
  }, [publications]);

  async function updateAccess(publicationId, accessCode) {
    setMessage("");
    const normalizedCode = accessCode.trim();
    if (!isWebBookPin(normalizedCode)) {
      setMessage("PINは4桁の数字で入力してください。");
      return false;
    }

    const { data, error } = await supabaseClient.functions.invoke("publish-voice-edition", {
      body: {
        action: "set_access",
        publicationId,
        accessCode: normalizedCode
      }
    });
    if (error || !data?.success) {
      setMessage(data?.error || "閲覧方法を変更できませんでした。もう一度お試しください。");
      return false;
    }
    setPublications((current) => current.map((publication) => (
      publication.publication_id === publicationId
        ? { ...publication, access_mode: data.accessMode }
        : publication
    )));
    setMessage(normalizedCode ? "暗証番号を設定しました。" : "暗証番号なしに変更しました。");
    return true;
  }

  async function updateSharing(publicationId, enabled) {
    setMessage('');
    const {data,error}=await supabaseClient.functions.invoke('publish-voice-edition',{
      body:{action:enabled?'resume':'disable',publicationId}
    });
    if(error||!data?.success){setMessage('共有状態を変更できませんでした。もう一度お試しください。');return;}
    setPublications(current=>current.map(p=>p.publication_id===publicationId?{...p,status:enabled?'published':'disabled'}:p));
    setMessage(enabled?'リンクからの閲覧を再開しました。':'リンクからの閲覧を停止しました。本棚からは引き続き開けます。');
  }

  return (
    <main className="voice-library-page">
      <header className="voice-library-header">
        <a href="/" aria-label="縦糸横糸のトップへ">
          <img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" />
        </a>
        {reviewContext ? <button className="voice-library-home-link" type="button" onClick={reviewContext.onHome}>ホームへ</button>
          : session && <a className="voice-library-home-link" href="/?app=1">ホームへ</a>}
      </header>

      <section className="voice-library-intro">
        <p>VOICE LIBRARY</p>
        <h1>声の本棚</h1>
        <span>一冊のブックとWebブックを、ひとつの作品として並べておく場所です。</span>
      </section>

      {!authReady || status === "loading" ? (
        <LibraryState text="本棚をひらいています。" />
      ) : status === "signed-out" ? (
        <section className="voice-library-signed-out">
          <h2>本棚を見るには、ログインしてください。</h2>
          <p>冊子のQRから声を聴くときは、これまでどおりログインは必要ありません。</p>
          <a href="/?app=1">ログインして本棚をひらく</a>
        </section>
      ) : status === "error" ? (
        <LibraryState text={message} action={loadLibrary} />
      ) : publications.length === 0 ? (
        <section className="voice-library-empty">
          <h2>本棚は、まだ空です。</h2>
          <p>完成した作品や、共有された物語がここに並びます。</p>
          <a href="/?app=1">ホームへ戻る</a>
        </section>
      ) : (
        <section className="voice-library-shelves">
          {message && <p className="voice-library-message" role="status">{message}</p>}
          {["owner", "managed", "purchased", "shared"].map((relationship) => {
            const entries = grouped[relationship] || [];
            if (entries.length === 0) return null;
            return (
              <div className="voice-library-shelf" key={relationship}>
                <h2>{relationshipLabels[relationship]}</h2>
                <div className="voice-library-grid">
                  {entries.map((publication) => (
                    <VoiceBookCard
                      key={publication.work_set_id || publication.publication_id}
                      publication={publication}
                      canManageAccess={publication.can_manage_access===true}
                      onOpen={reviewContext?.onOpenPublication}
                      onUpdateAccess={updateAccess}
                      onUpdateSharing={updateSharing}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {session && !reviewContext && (
        <aside className="voice-library-next">
          <p>物語を聴いた先で、また残しておきたい声が見つかったときに。</p>
          <a href="/?app=1">新しい語りを残す</a>
          <span>ご家族への共有や増刷は、各作品の管理画面から行えます。</span>
        </aside>
      )}
    </main>
  );
}

function VoiceBookCard({ publication, canManageAccess, onUpdateAccess, onUpdateSharing, onOpen }) {
  const [accessCode, setAccessCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveAccess(event) {
    event.preventDefault();
    setSaving(true);
    await onUpdateAccess(publication.publication_id, accessCode);
    setAccessCode("");
    setSaving(false);
  }

  return (
    <article className="voice-book-card">
      <a className="voice-book-cover" href={`/?voice=${encodeURIComponent(publication.public_id)}`}
        onClick={onOpen ? event => { event.preventDefault(); onOpen(publication); } : undefined}>
        <small>{publication.subject_name || "縦糸横糸"}</small>
        <h3>{publication.title || "残された声"}</h3>
        {publication.subtitle && <p>{publication.subtitle}</p>}
        <span>Webブックを開く</span>
      </a>
      <div className="voice-book-work-set" aria-label="作品の内容">
        {publication.paper_book_ordered === true && <div><span>縦糸横糸ブック</span><small>注文済み</small></div>}
        <div><span>縦糸横糸 Webブック</span><small>閲覧できます</small></div>
      </div>
      <div className="voice-book-meta">
        {publication.published_at && <time>{formatPublishedAt(publication.published_at)} 公開</time>}
        {publication.access_mode === "code" && <span>暗証番号あり</span>}
        {publication.status === 'disabled' && <span>リンクからの閲覧は停止中</span>}
      </div>
      {canManageAccess && (
        <details className="voice-book-access">
          <summary>閲覧方法</summary>
          <p>{publication.status==='disabled'?'現在、QRやリンクからの閲覧は停止しています。':publication.access_mode === "code" ? "現在は暗証番号が必要です。" : "現在はQRやリンクを知っている方が聴けます。"}</p>
          <button type="button" disabled={saving} onClick={async()=>{setSaving(true);try{await onUpdateSharing(publication.publication_id,publication.status==='disabled');}finally{setSaving(false);}}}>
            {publication.status==='disabled'?'リンクからの閲覧を再開':'リンクからの閲覧を停止'}
          </button>
          <form onSubmit={saveAccess}>
            <input
              aria-label="新しい暗証番号"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4桁のPIN。空欄で解除"
              value={accessCode}
              maxLength={4}
              onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <button type="submit" disabled={saving}>{saving ? "保存中" : "保存"}</button>
          </form>
        </details>
      )}
    </article>
  );
}

function LibraryState({ text, action }) {
  return (
    <section className="voice-library-state" aria-live="polite">
      <p>{text}</p>
      {action && <button type="button" onClick={action}>もう一度試す</button>}
    </section>
  );
}
