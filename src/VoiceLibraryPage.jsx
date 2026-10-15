import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Bookshelf from "./Bookshelf.jsx";
import { libraryFromPublications, formatBookMonth as formatPublishedAt } from "./lib/bookshelf.js";
import "./voice-library.css";

export default function VoiceLibraryPage({ supabaseClient }) {
  const [session, setSession] = useState(null), [authReady, setAuthReady] = useState(false);
  const [publications, setPublications] = useState([]), [status, setStatus] = useState("loading"), [message, setMessage] = useState("");
  const request = useRef(0);

  useEffect(() => {
    let mounted = true;
    const setAuth = next => { if (!mounted) return; request.current++; setPublications([]); setSession(next); setAuthReady(true); };
    supabaseClient.auth.getSession().then(({ data }) => setAuth(data.session || null)).catch(() => setAuth(null));
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, next) => setAuth(next));
    return () => { mounted = false; request.current++; listener.subscription.unsubscribe(); };
  }, [supabaseClient]);

  const loadLibrary = useCallback(async () => {
    if (!session) return;
    const ticket = ++request.current;
    setStatus("loading"); setMessage("");
    try {
      let result = await supabaseClient.rpc("list_voice_library_people");
      // Deploy UI independently. Do not mask authorization/network errors with a fallback.
      if (result.error && ["PGRST202", "42883"].includes(result.error.code)) {
        result = await supabaseClient.rpc("list_voice_library");
        if (!result.error && result.data?.length) {
          // Read only identities behind already authorized library entries, under existing RLS.
          const [projects, links] = await Promise.all([
            supabaseClient.from("book_projects").select("id, subject_person_id").in("id", [...new Set(result.data.map(row => row.book_project_id))]),
            supabaseClient.from("user_person_links").select("person_id").eq("user_id", session.user.id).eq("role", "self")
          ]);
          if (projects.error || links.error) throw projects.error || links.error;
          const identities = new Map((projects.data || []).map(project => [project.id, project.subject_person_id]));
          const selfIds = new Set((links.data || []).map(link => link.person_id));
          result.data = result.data.map(row => ({ ...row, subject_person_id: identities.get(row.book_project_id), is_self: selfIds.has(identities.get(row.book_project_id)) }));
        }
      }
      if (ticket !== request.current) return;
      if (result.error) throw result.error;
      setPublications(result.data || []); setStatus("ready");
    } catch {
      if (ticket !== request.current) return;
      setStatus("error"); setMessage("本棚を読み込めませんでした。時間をおいて、もう一度お試しください。");
    }
  }, [session, supabaseClient]);

  useEffect(() => {
    if (authReady && session) loadLibrary();
    if (authReady && !session) setStatus("signed-out");
  }, [authReady, loadLibrary, session]);

  const library = useMemo(() => libraryFromPublications(publications), [publications]);

  async function updateAccess(publicationId, accessCode) {
    setMessage("");
    const normalizedCode = accessCode.replace(/\D/g, "").slice(0, 8);
    if (normalizedCode && normalizedCode.length < 4) { setMessage("暗証番号は4〜8桁の数字で入力してください。"); return false; }
    const { data, error } = await supabaseClient.functions.invoke("publish-voice-edition", {
      body: { action: "set_access", publicationId, accessCode: normalizedCode }
    });
    if (error || !data?.success) { setMessage(data?.error || "閲覧方法を変更できませんでした。もう一度お試しください。"); return false; }
    setPublications(current => current.map(publication => publication.publication_id === publicationId ? { ...publication, access_mode: data.accessMode } : publication));
    setMessage(normalizedCode ? "暗証番号を設定しました。" : "暗証番号なしに変更しました。");
    return true;
  }

  return <main className="voice-library-page voice-library-redesign">
    {status !== "ready" && <h1 className="voice-library-title">本棚</h1>}
    {!authReady || status === "loading" ? <LibraryState text="本棚をひらいています。" />
      : !session || status === "signed-out" ? <section className="voice-library-signed-out"><h2>本棚を見るには、ログインしてください。</h2><p>冊子のQRから声を聴くときは、これまでどおりログインは必要ありません。</p><a href="/?app=1">ログインして本棚をひらく</a></section>
      : status === "error" ? <LibraryState text={message} action={loadLibrary} />
      : <><Bookshelf key={session.user.id} {...library} renderBookDetails={book => {
          const publication = publications.find(p => p.publication_id === book.id);
          return publication ? <BookAccessDetails publication={publication} canManageAccess={book.canManageAccess} onUpdateAccess={updateAccess} /> : null;
        }} />{message && <p className="voice-library-message" role="status">{message}</p>}</>}
    {session && <footer className="voice-library-return"><a href="/?app=1">ホームへ戻る</a></footer>}
  </main>;
}

function BookAccessDetails({ publication, canManageAccess, onUpdateAccess }) {
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
      <a className="voice-open-publication" href={`/?voice=${encodeURIComponent(publication.public_id)}`}>Webブックを開く</a>
      <div className="voice-book-meta">
        {publication.published_at && <time>{formatPublishedAt(publication.published_at)} 公開</time>}
        {publication.access_mode === "code" && <span>暗証番号あり</span>}
      </div>
      {canManageAccess && (
        <details className="voice-book-access">
          <summary>閲覧方法</summary>
          <p>{publication.access_mode === "code" ? "現在は暗証番号が必要です。" : "現在はQRやリンクを知っている方が聴けます。"}</p>
          <form onSubmit={saveAccess}>
            <input
              aria-label="新しい暗証番号"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4〜8桁。空欄で解除"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <button type="submit" disabled={saving}>{saving ? "保存中" : "保存"}</button>
          </form>
        </details>
      )}
    </article>
  );
}


function LibraryState({ text, action }) {
  return <section className="voice-library-state" aria-live="polite"><p>{text}</p>{action && <button type="button" onClick={action}>もう一度試す</button>}</section>;
}
