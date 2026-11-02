import { useState } from "react";

const TARGET = "菅原test1027";
const CONFIRMATION = `${TARGET}をリセット`;

async function callReset(client, body) {
  const { data, error } = await client.functions.invoke("admin-test-reset", { body });
  if (error) {
    const response = error.context;
    const detail = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    throw new Error(detail?.error || data?.error || error.message || "初期化処理に失敗しました");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function Count({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-lg font-medium tabular-nums">{Number(value || 0)}件</dd></div>;
}

export default function FixedLineTestReset({ client }) {
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function loadPreview() {
    setBusy("preview");
    setError("");
    setPreview(null);
    setConfirmation("");
    setResult(null);
    try {
      const data = await callReset(client, { action: "preview" });
      if (!data?.preview || !Array.isArray(data.preview.blockers)) {
        throw new Error("削除対象を確認できませんでした");
      }
      setPreview(data.preview);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy("");
    }
  }

  async function execute() {
    if (!preview?.id || preview.blockers.length || confirmation !== CONFIRMATION || busy) return;
    if (!window.confirm(`${TARGET}の文章・音声・保存ファイルを初期化します。元に戻せません。実行しますか？`)) return;
    setBusy("execute");
    setError("");
    try {
      const data = await callReset(client, {
        action: "execute",
        fingerprint: preview.fingerprint,
        confirmation: CONFIRMATION
      });
      setResult(data);
      setPreview(null);
      setConfirmation("");
    } catch (cause) {
      setError(`${cause.message}。削除対象を再確認してください。`);
      setPreview(null);
      setConfirmation("");
    } finally {
      setBusy("");
    }
  }

  async function retryStorage() {
    setBusy("retry");
    setError("");
    try {
      const data = await callReset(client, { action: "retry_storage" });
      setResult(data.results?.every((job) => job.status === "complete")
        ? { status: "complete", job_id: data.results?.[0]?.job_id }
        : { status: "storage_pending", job_id: data.results?.[0]?.job_id });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy("");
    }
  }

  const blocked = !preview?.id || preview.blockers.length > 0 || !/^[0-9a-f]{32}$/.test(preview?.fingerprint || "");

  return <section className="rounded-2xl border border-amber-300 bg-white p-5 shadow-sm sm:p-7">
    <h3 className="text-lg font-medium">固定LINEテストアカウントの初期化</h3>
    <p className="mt-2 text-sm leading-7 text-slate-600">
      対象は登録済みの「{TARGET}」だけです。同じスマートフォン・LINEで最初の登録から再検証するために使います。
      注文・決済・返金の記録は削除しません。実課金や処理中の注文など、安全に初期化できない状態では実行できません。
    </p>
    <button type="button" onClick={loadPreview} disabled={Boolean(busy)} className="mt-5 rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium disabled:opacity-50">
      {busy === "preview" ? "確認中…" : "削除対象を確認"}
    </button>

    {preview && <div className="mt-6 border-t border-slate-200 pt-5">
      <p className="text-sm font-medium">固定対象：{preview.display_name || TARGET}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Count label="作品" value={preview.project_count} />
        <Count label="回答" value={preview.answer_count} />
        <Count label="下書き" value={preview.draft_count} />
        <Count label="保存ファイル" value={preview.storage_count} />
        <Count label="音声等のデータ" value={preview.media_count} />
        <Count label="LINE連携" value={preview.line_connection_count} />
        <Count label="配信予約" value={preview.schedule_count} />
        <Count label="保持する注文" value={preview.financial_order_count} />
      </dl>
      {preview.blockers.length > 0 ? <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-medium">安全条件を満たさないため、初期化できません。</p>
        <ul className="mt-2 list-disc pl-5">{preview.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul>
      </div> : <p className="mt-5 text-sm text-emerald-700">停止条件はありません。実行時にサーバー側でもう一度確認します。</p>}
      {!blocked && <div className="mt-5 rounded-xl bg-amber-50 p-4">
        <label htmlFor="fixed-line-reset-confirmation" className="block text-sm text-slate-700">文章・音声・保存ファイルは復元できません。実行するには「{CONFIRMATION}」と入力してください。</label>
        <input id="fixed-line-reset-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" />
        <button type="button" onClick={execute} disabled={confirmation !== CONFIRMATION || Boolean(busy)} className="mt-3 rounded-xl bg-rose-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-40">
          {busy === "execute" ? "初期化中…" : "固定対象を初期化"}
        </button>
      </div>}
    </div>}

    {result && <div role="status" className={`mt-5 rounded-xl p-4 text-sm ${result.status === "complete" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {result.status === "complete" ? "初期化と残存データの確認が完了しました。同じLINEで再登録できます。" : "DBの初期化は進みましたが、保存ファイルの後処理が残っています。再試行してください。"}
      {result.job_id && <p className="mt-1 text-xs">監査ジョブ：{result.job_id}</p>}
      {result.status === "storage_pending" && <button type="button" onClick={retryStorage} disabled={Boolean(busy)} className="mt-3 rounded-xl border border-amber-700 px-4 py-2 disabled:opacity-40">保存ファイルの処理を再試行</button>}
    </div>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <p className="mt-5 text-xs leading-6 text-slate-500">LINE公式アカウントの友だち状態や認可履歴はLINE側に残ります。完全な初回友だち追加の確認には、LINE側でブロック・友だち解除と連携解除を行ってから始めてください。</p>
  </section>;
}
