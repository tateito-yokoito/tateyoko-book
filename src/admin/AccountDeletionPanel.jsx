import { useState } from "react";

async function functionError(error, data) {
  if (data?.error) return data.error;
  const response = error?.context;
  if (response?.json) {
    const body = await response.json().catch(() => null);
    if (body?.error) return body.error;
  }
  return error?.message || "処理を完了できませんでした。";
}

export default function AccountDeletionPanel({ client, account, onDeleted }) {
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingStorage, setPendingStorage] = useState(false);
  const accountId = account?.id;
  const confirmationText = account?.email || accountId;
  const blockers = Array.isArray(preview?.blockers) ? preview.blockers : [];

  async function loadPreview() {
    if (!accountId || busy) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setConfirmation("");
    try {
      const { data, error: invokeError } = await client.functions.invoke("admin-delete-accounts", {
        body: { action: "preview", account_ids: [accountId] }
      });
      if (invokeError || !data?.previews?.[0]) throw new Error(await functionError(invokeError, data));
      setPreview(data.previews[0]);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (busy || !preview?.fingerprint || blockers.length || confirmation !== confirmationText) return;
    setBusy(true);
    setError("");
    try {
      // The server rechecks the account and all blockers against this fingerprint.
      const { data, error: invokeError } = await client.functions.invoke("admin-delete-accounts", {
        body: { action: "delete", confirmations: [{ id: accountId, fingerprint: preview.fingerprint }] }
      });
      if (invokeError) throw new Error(await functionError(invokeError, data));
      const result = data?.results?.find((item) => item.id === accountId);
      if (result?.status === "storage_pending") {
        setPendingStorage(true);
        setPreview(null);
        return;
      }
      if (result?.status !== "complete") throw new Error(result?.error || "削除結果を確認できませんでした。");
      onDeleted?.();
    } catch (caught) {
      setError(caught.message);
      setPreview(null);
      setConfirmation("");
    } finally {
      setBusy(false);
    }
  }

  async function retryStorage() {
    setBusy(true);
    setError("");
    try {
      const { data, error: invokeError } = await client.functions.invoke("admin-delete-accounts", {
        body: { action: "retry_storage" }
      });
      if (invokeError) throw new Error(await functionError(invokeError, data));
      if (Number(data?.pending || 0) > 0) throw new Error("保存ファイルの削除がまだ完了していません。");
      onDeleted?.();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-rose-300 bg-white p-5 text-sm">
      <h3 className="font-semibold text-rose-800">アカウントを完全削除</h3>
      <p className="mt-2 leading-6 text-slate-600">管理者の整理モードでのみ実行できます。アカウント・家族・所有する物語・保存ファイルは復元できません。決済記録は必要な範囲で保持されます。</p>
      <button type="button" disabled={busy} onClick={loadPreview} className="mt-4 rounded-lg border border-rose-300 px-4 py-2 font-medium text-rose-800 disabled:opacity-50">
        {busy ? "確認中…" : "削除前の影響を確認"}
      </button>
      {preview && (
        <div className="mt-4 space-y-3 rounded-xl bg-rose-50 p-4">
          <p>対象：{preview.email || preview.id}</p>
          <p>物語 {preview.project_count || 0}件 · 回答 {preview.answer_count || 0}件 · メディア {preview.media_count || 0}件 · 保存ファイル {preview.storage_count || 0}件</p>
          <p>決済記録 {preview.financial_order_count || 0}件（実決済 {preview.charged_order_count || 0}件）</p>
          {blockers.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-rose-800">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          ) : (
            <>
              <label className="block">完全削除する場合は「{confirmationText}」を入力
                <input type="text" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-rose-300 bg-white p-2" />
              </label>
              <button type="button" disabled={busy || confirmation !== confirmationText} onClick={deleteAccount} className="rounded-lg bg-rose-800 px-4 py-3 font-semibold text-white disabled:opacity-40">
                このアカウントを完全削除
              </button>
            </>
          )}
        </div>
      )}
      {pendingStorage && <div className="mt-3 text-rose-800">
        <p>アカウントは削除されました。保存ファイルの後処理が必要です。</p>
        <button type="button" disabled={busy} onClick={retryStorage} className="mt-2 rounded-lg border border-rose-300 px-4 py-2 disabled:opacity-40">保存ファイル削除を再試行</button>
      </div>}
      {error && <p role="alert" className="mt-3 text-rose-800">{error}</p>}
    </section>
  );
}
