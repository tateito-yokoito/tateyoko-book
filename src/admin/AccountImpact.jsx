import { useEffect, useRef } from "react";

export const ACCOUNT_ROLE_LABELS = { owner: "所有", purchaser: "購入者", supporter: "お手伝い" };

export function summarizeAccountImpact(impact) {
  const projects = impact?.projects || [];
  const owned = projects.filter(project => project.roles.includes("owner"));
  const sum = key => owned.reduce((total, project) => total + Number(project[key] || 0), 0);
  return {
    owned,
    supporting: projects.filter(project => project.roles.includes("supporter")).length,
    hidden: owned.filter(project => project.hidden).length,
    answers: sum("answer_count"), additions: sum("addition_count"), videos: sum("video_count"),
    publications: sum("publication_count"), starting: sum("starting_count"),
    introductions: sum("introduction_count"), introductionAdditions: sum("introduction_addition_count")
  };
}

export function AccountImpactSummary({ impact, confirmation = false }) {
  if (!impact) return <p role="alert">利用状況を取得できません。再読み込みしてください。</p>;
  const summary = summarizeAccountImpact(impact);
  if (!confirmation) return <section className="admin-usage-card">
    <h3>利用状況</h3>
    <p>所有する物語 <strong>{summary.owned.length}件</strong>　語り <strong>{summary.answers}件</strong>
      {summary.additions > 0 && <>　語り足し <strong>{summary.additions}本</strong></>}
      {summary.videos > 0 && <>　動画 <strong>{summary.videos}本</strong></>}
      {summary.introductions > 0 && <>　私の歩み <strong>{summary.introductions}件</strong></>}</p>
    <details><summary>集計の詳細</summary><p>所有する物語のみの集計です。語りには「はじめの会話」{summary.starting}件を含みます。語り足しは各回答の2本目以降の音声です。「私の歩み」{summary.introductions}件・追加音声{summary.introductionAdditions}本は別集計です。</p></details>
  </section>;
  return <section className="admin-stop-summary">
    <h3 className="text-sm font-medium">停止すると</h3>
    {impact.is_admin && <p className="mt-3 font-medium text-rose-700">管理者・停止不可：有効な管理者アカウントは停止できません。</p>}
    <ul><li>このアカウントでログイン・お手伝いができなくなります。</li><li>所有する物語{summary.owned.length}件は管理画面で非表示になります。</li><li>メール登録を解除し、そのアドレスを新規登録に使える状態にします。</li></ul>
    <p><strong>記録は削除しません。</strong>購入者・お手伝いとして関わる他の方の物語は非表示にしません。</p>
    {summary.publications > 0 && <p className="admin-warning">公開中のWeb冊子{summary.publications}件は、停止後も閲覧できます。公開停止は物語の詳細から行ってください。</p>}
  </section>;
}

export function AccountProjectFacts({ project, confirmation = false }) {
  return <div className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
    <p>{project.roles.map(role => ACCOUNT_ROLE_LABELS[role]).join("・")}{project.hidden ? " · 非表示済み" : ""}</p>
    <details><summary>記録の内訳</summary><p>語り {project.answer_count}件（はじめの会話 {project.starting_count}件） · 語り足し {project.addition_count}本 · 動画 {project.video_count}本</p>
    {project.introduction_count > 0 && <p>「私の歩み」作成済み（追加音声 {project.introduction_addition_count}本・別集計）</p>}
    <p>お手伝い {project.supporter_count}人 · 共有先設定 {project.sharing_count}件 · 限定公開 {project.publication_count}件</p>
    </details>
    {confirmation && <p>{project.roles.includes("owner") ? "管理画面で非表示にします（記録は保持）" : "この物語は非表示にしません"}</p>}
  </div>;
}

export function AccountRetirementDialog({ account, impact, busy, error, onClose, onConfirm }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, []);
  const handleKey = event => {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key !== "Tab") return;
    const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled), summary")];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onKeyDown={handleKey}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="retirement-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#f8f7f4] p-5 shadow-xl sm:p-6">
      <h2 id="retirement-title" className="text-lg font-medium">このアカウントを停止しますか？</h2>
      <p className="mt-2 break-words text-sm">{account.display_name || "名称未登録"} · {account.email}</p>
      <div className="mt-5"><AccountImpactSummary impact={impact} confirmation /></div>
      <h3 className="mt-5 text-sm font-medium">関係する物語（非表示済みを含む）</h3>
      {impact.projects.map(project => <div key={project.id} className="mt-3 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-medium">{project.name}</p><AccountProjectFacts project={project} confirmation /></div>)}
      {!impact.projects.length && <p className="mt-3 text-sm text-slate-500">関係する物語はありません。</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      <div className="sticky bottom-0 mt-5 flex flex-wrap justify-end gap-3 bg-[#f8f7f4] py-3">
        <button ref={cancelRef} disabled={busy} onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm disabled:opacity-50">キャンセル</button>
        <button disabled={busy || impact.is_admin} onClick={onConfirm} className="rounded-xl bg-rose-700 px-4 py-3 text-sm text-white disabled:opacity-40">{busy ? "確認・処理中…" : "停止してメール登録を解除"}</button>
      </div>
    </section>
  </div>;
}
