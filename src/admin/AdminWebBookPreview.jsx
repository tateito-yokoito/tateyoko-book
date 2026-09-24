import { useEffect, useState } from 'react';
import WebBook from '../WebBook.jsx';
import { snapshotToWebBook } from '../lib/webBook.js';

// The reader has no mutation client. Only the admin-only Edge can supply its
// current-draft snapshot; completed publications are refused server-side.
export default function AdminWebBookPreview({ client, projectId, onClose }) {
  const [state, setState] = useState({ loading: true, work: null, error: '' });
  const load = async () => {
    setState({ loading: true, work: null, error: '' });
    const { data, error } = await client.functions.invoke('admin-web-book-preview', { body: { projectId } });
    if (error || !data?.success || !data.snapshot) {
      setState({ loading: false, work: null, error: '制作中Webブックを開けませんでした。公開状態と権限を確認してください。' });
      return;
    }
    setState({ loading: false, work: snapshotToWebBook(data.snapshot), error: '' });
  };
  useEffect(() => { load(); }, [client, projectId]);
  if (!state.work) return <div className="wb wb-message" role="dialog" aria-label="Webブック Live Preview">
    <button onClick={onClose}>管理画面へ戻る</button>
    <h1>Webブック Live Preview</h1>
    <p>{state.loading ? '読み込んでいます…' : state.error}</p>
    {!state.loading && <button onClick={load}>再読み込み</button>}
  </div>;
  return <><aside className="wb-preview">制作中 Webブック｜管理者 Live Preview <button onClick={onClose}>確認を終える</button></aside>
    <WebBook publication={state.work} resolveAsset={async () => { throw Error('素材を取得できませんでした。'); }} onClose={onClose} />
  </>;
}
