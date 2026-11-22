import React, { useState } from 'react';
import FamilyAvatar from './FamilyAvatar.jsx';
import './family-relationship-editor.css';

const relationRole = (relation,personId) => relation.relation_type === 'spouse' ? 'spouse'
  : relation.person_a_id === personId ? 'child' : 'parent';
const relationLabel = (role,other) => role === 'spouse' ? '配偶者' : role === 'child' ? '子ども'
  : other.gender === 'female' ? '母' : other.gender === 'male' ? '父' : '親';

export function suggestionQuestion(item) {
  if (item.kind === 'shared_child_spouse')
    return `${item.personA.display_name}さんと${item.personB.display_name}さんは、ご夫婦ですか？`;
  const role = item.personA.gender === 'female' ? 'お母さん'
    : item.personA.gender === 'male' ? 'お父さん' : '親御さん';
  return `${item.personA.display_name}さんは、${item.personB.display_name}さんの${role}ですか？`;
}

export function FamilyRelationQuestion({ item, busy, onAnswer }) {
  return <div className="fr-question" role="group" aria-label="家族関係の確認">
    <div className="fr-question-people">
      {[item.personA,item.personB].map(person => <div key={person.id}>
        <FamilyAvatar person={person}/><strong>{person.display_name}</strong></div>)}
    </div>
    <p>{suggestionQuestion(item)}</p>
    <div className="fr-answers">
      <button type="button" disabled={busy} onClick={() => onAnswer(item,'yes')}>はい</button>
      <button type="button" disabled={busy} onClick={() => onAnswer(item,'no')}>いいえ</button>
      <button type="button" disabled={busy} onClick={() => onAnswer(item,'later')}>あとで</button>
    </div>
  </div>;
}

export default function FamilyRelationshipEditor({ person, people, relations, suggestions,
  busy, onSave, onRemove, onAnswer }) {
  const [editing, setEditing] = useState(null);
  const [otherId, setOtherId] = useState('');
  const [role, setRole] = useState('parent');
  const byId = new Map(people.map(item => [item.id,item]));
  const current = relations.filter(row => row.person_a_id === person.id || row.person_b_id === person.id)
    .map(row => ({ relation:row, other:byId.get(row.person_a_id === person.id ? row.person_b_id : row.person_a_id),
      role:relationRole(row,person.id) })).filter(item => item.other);
  const relatedIds = new Set(current.map(item => item.other.id));
  const available = people.filter(item => item.id !== person.id && !relatedIds.has(item.id));
  const deferred = suggestions.filter(item => item.status === 'later'
    && (item.person_a_id === person.id || item.person_b_id === person.id));
  const close = () => { setEditing(null); setOtherId(''); setRole('parent'); };
  return <section className="fr-section" aria-label="家族との関係">
    <h2>家族との関係</h2>
    {current.length ? <div className="fr-list">{current.map(item => <div className="fr-row" key={item.relation.id}>
      <FamilyAvatar person={item.other}/><span><small>{relationLabel(item.role,item.other)}</small>
        <strong>{item.other.display_name}</strong></span>
      <button type="button" onClick={() => { setEditing(item.relation); setOtherId(item.other.id); setRole(item.role); }}>
        関係を編集</button>
    </div>)}</div> : <p className="fr-empty">家族との関係は、まだ登録されていません。</p>}
    {available.length > 0 && !editing && <button type="button" className="fr-add" onClick={() => setEditing('new')}>
      ＋ 家族との関係を追加</button>}
    {editing && <form className="fr-form" onSubmit={async event => {
      event.preventDefault();
      if (await onSave(otherId,role,editing === 'new' ? null : editing.id)) close();
    }}>
      <label>登録済みの人物<select required value={otherId} disabled={editing !== 'new'}
        onChange={event => setOtherId(event.target.value)}><option value="">選んでください</option>
        {(editing === 'new' ? available : [byId.get(otherId)]).filter(Boolean).map(item =>
          <option value={item.id} key={item.id}>{item.display_name}</option>)}</select></label>
      <label>この人から見た関係<select value={role} onChange={event => setRole(event.target.value)}>
        <option value="parent">親（父・母）</option><option value="spouse">配偶者</option>
        <option value="child">子ども</option></select></label>
      <button className="fr-save" disabled={busy || !otherId}>関係を保存する</button>
      {editing !== 'new' && <button type="button" className="fr-remove" disabled={busy}
        onClick={async () => {
          if (!window.confirm('関係だけを解除します。人物は残ります。よろしいですか？')) return;
          if (await onRemove(editing.id)) close();
        }}>この関係を解除する（人物は残す）</button>}
      <button type="button" className="fr-cancel" onClick={close}>閉じる</button>
    </form>}
    {deferred.length > 0 && <div className="fr-deferred"><h3>あとで確認する関係</h3>
      <FamilyRelationQuestion item={deferred[0]} busy={busy} onAnswer={onAnswer}/></div>}
  </section>;
}
