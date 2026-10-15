import React, { useEffect, useId, useState } from 'react';
import { SUPPORTER_RELATIONSHIPS, relationshipLabel } from './lib/supporterIdentity.js';

export function SupporterIdentityFields({ value, onChange, subjectName, disabled = false, names = true }) {
  const id = useId();
  const change = (key, next) => onChange({ ...value, [key]: next });
  return <fieldset disabled={disabled} className="space-y-4 text-left">
    {names && <div className="grid grid-cols-2 gap-3">
      {[['familyName', '姓', 'family-name'], ['givenName', '名', 'given-name']].map(([key, label, auto]) => <label key={key} htmlFor={`${id}-${key}`} className="text-white/65 text-sm">
        {label}<input id={`${id}-${key}`} className="quiet-input mt-2" autoComplete={auto} required maxLength={80} value={value[key]} onChange={e => change(key, e.target.value)} />
      </label>)}
    </div>}
    <label htmlFor={`${id}-relation`} className="block text-white/65 text-sm">
      あなたから見て、{subjectName || '物語のご本人'}は？
      <select id={`${id}-relation`} className="quiet-input mt-2" style={{ display: 'block', width: '100%', backgroundColor: '#101d30', color: '#f4f1eb', padding: '12px 8px' }} required value={value.relationship} onChange={e => change('relationship', e.target.value)}>
        <option className="text-slate-900" value="">選んでください</option>
        {SUPPORTER_RELATIONSHIPS.map(([key, label]) => <option className="text-slate-900" key={key} value={key}>{{child:'親',parent:'子',grandchild:'祖父母'}[key] || label}</option>)}
      </select>
    </label>
    {value.relationship === 'other' && <label htmlFor={`${id}-other`} className="block text-white/65 text-sm">関係を入力（例：仕事仲間）
      <input id={`${id}-other`} className="quiet-input mt-2" required maxLength={80} value={value.other} onChange={e => change('other', e.target.value)} />
    </label>}
  </fieldset>;
}

export function SupporterFamilyCandidates({ client, projectId, onSelect, disabled = false }) {
  const [state, setState] = useState({ loading: true, items: [], error: false });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, items: [], error: false });
    if (!projectId) { setState({ loading: false, items: [], error: false }); return; }
    client.rpc('list_supporter_family_candidates', { input_book_project_id: projectId }).then(({ data, error }) => {
      if (!cancelled) setState({ loading: false, items: error ? [] : data || [], error: Boolean(error) });
    }).catch(() => { if (!cancelled) setState({ loading: false, items: [], error: true }); });
    return () => { cancelled = true; };
  }, [client, projectId]);
  if (state.loading) return <p className="text-white/45 text-xs" role="status">登録済みのご家族を確認しています…</p>;
  if (state.error) return <p className="text-white/45 text-xs" role="status">ご家族の候補を読み込めませんでした。メールアドレスから依頼できます。</p>;
  if (!state.items.length) return null;
  return <div className="space-y-2 text-left"><p className="ui-label">登録済みの家族から選ぶ</p>
    {state.items.map(item => <button key={item.candidate_id} type="button" disabled={disabled || item.support_status !== 'available'} onClick={() => onSelect(item)} className="w-full glass-card px-4 py-3 text-left disabled:opacity-45">
      <span className="block text-white/80 text-sm">{item.display_name}</span>
      <span className="block text-white/45 text-xs mt-1">{relationshipLabel(item.relationship)}{item.support_status === 'pending' ? ' · 依頼中' : item.support_status === 'active' ? ' · お手伝い中' : ''}</span>
    </button>)}
  </div>;
}

function RelationshipEditor({ client, item, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState({ relationship: item.relationship || '', other: item.relationship_other || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = value.relationship && (value.relationship !== 'other' || value.other.trim());
  const save = async () => {
    if (!valid || busy || client.adminReadOnly) return;
    setBusy(true); setError('');
    try {
      const { error: failure } = await client.rpc('update_my_supporter_relationship', {
        input_book_project_id: item.book_project_id, input_relationship: value.relationship,
        input_relationship_other: value.relationship === 'other' ? value.other.trim() : null
      });
      if (failure) throw failure;
      onSaved({ ...item, relationship: value.relationship, relationship_other: value.relationship === 'other' ? value.other.trim() : null });
      setEditing(false);
    } catch { setError('保存できませんでした。もう一度お試しください。'); }
    finally { setBusy(false); }
  };
  return <section className="glass-card p-4 space-y-3">
    <p className="text-white/80 text-sm">{item.subject_name}さんの物語</p>
    {editing ? <>
      <SupporterIdentityFields names={false} subjectName={`${item.subject_name}さん`} value={value} onChange={setValue} disabled={busy} />
      <div className="flex gap-5">
        <button type="button" disabled={!valid || busy || client.adminReadOnly} className="text-white text-sm disabled:opacity-40" onClick={save}>{busy ? '保存中…' : '保存する'}</button>
        <button type="button" disabled={busy} className="text-white/50 text-sm" onClick={() => { setEditing(false); setError(''); }}>キャンセル</button>
      </div>
    </> : <div className="flex justify-between gap-3">
      <p className="text-white/50 text-sm">関係：{relationshipLabel(item.relationship, item.relationship_other)}</p>
      <button type="button" className="text-white/60 text-sm underline underline-offset-4" onClick={() => { setValue({ relationship: item.relationship || '', other: item.relationship_other || '' }); setEditing(true); }}>{item.relationship ? '変更する' : '登録する'}</button>
    </div>}
    {error && <p role="alert" className="text-rose-200 text-sm">{error}</p>}
  </section>;
}

export function SupporterRelationshipsSettings({ client }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    client.rpc('list_my_supporter_identities').then(({ data, error }) => {
      if (!cancelled) { setItems(data || []); setError(Boolean(error)); setLoading(false); }
    }).catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [client]);
  if (loading) return <p className="text-white/40 text-xs" role="status">お手伝い先を確認しています…</p>;
  if (error) return <p className="text-white/45 text-xs" role="alert">お手伝い先の関係を読み込めませんでした。開き直してお試しください。</p>;
  if (!items.length) return null;
  return <div className="space-y-3"><p className="ui-label">お手伝い先との関係</p>
    {items.some(item => !item.relationship) && <p className="text-white/55 text-xs">未登録の関係を確認できます。今までのお手伝いはそのまま続けられます。</p>}
    {items.map(item => <RelationshipEditor key={item.book_project_id} client={client} item={item} onSaved={next => setItems(previous => previous.map(old => old.book_project_id === next.book_project_id ? next : old))} />)}
  </div>;
}
