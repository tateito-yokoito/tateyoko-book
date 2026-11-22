import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, RotateCcw, Users } from 'lucide-react';
import FamilyAvatar from './FamilyAvatar.jsx';
import './family-tree.css';

export function treeNeighbors(centerId, people, relations) {
  const byId = new Map(people.map(person => [person.id, person]));
  const related = (type, test, pick) => relations.filter(row => row.relation_type === type && test(row))
    .map(row => ({ relation: row, person: byId.get(pick(row)) })).filter(item => item.person);
  return {
    parents: related('parent_child', row => row.person_b_id === centerId, row => row.person_a_id),
    spouses: related('spouse', row => row.person_a_id === centerId || row.person_b_id === centerId,
      row => row.person_a_id === centerId ? row.person_b_id : row.person_a_id),
    children: related('parent_child', row => row.person_a_id === centerId, row => row.person_b_id),
  };
}

function roleName(item) {
  if (item.relation.relation_type === 'spouse') return '配偶者';
  return item.person.gender === 'female' ? '母' : item.person.gender === 'male' ? '父' : '親';
}

function PersonNode({ item, label, onCenter, onEdit, center = false }) {
  const person = item.person || item;
  return <div className={`ft-node ${center ? 'is-center' : ''}`}>
    <button type="button" className="ft-node-main" onClick={() => onCenter(person.id)}
      aria-label={`${person.display_name}さんを中心にする`}>
      <strong className="ft-person-name">{person.display_name}</strong>
      <small>{label}</small>
      <span className="ft-avatar-ring"><FamilyAvatar person={person}/></span>
    </button>
    {item.relation && <button type="button" className="ft-edit" onClick={() => onEdit(item)}>関係を直す</button>}
  </div>;
}

export default function FamilyTree({ people, relations, selfId, centerId, onCenter, onAdd,
  onOpenPerson, onHome, onEditRelation, onRemoveRelation }) {
  const [editing, setEditing] = useState(null);
  const [role, setRole] = useState('parent');
  const center = people.find(item => item.id === centerId) || null;
  const { parents, spouses, children } = treeNeighbors(centerId, people, relations);
  const chooseEdit = item => {
    setEditing(item);
    setRole(item.relation.relation_type === 'spouse' ? 'spouse'
      : item.relation.person_a_id === centerId ? 'child' : 'parent');
  };
  return <main className="ft-page">
    <header className="ft-header"><button type="button" onClick={onHome} aria-label="家族ホームへ戻る"><ArrowLeft/></button>
      <h1>家系図</h1><span/></header>
    {!center ? <section className="ft-empty"><Users/><h2>家族を一人ずつ、ここから</h2>
      <p>最初に自分を登録すると、家族のつながりを広げられます。</p>
      <button type="button" className="ft-primary" onClick={() => onAdd(null, 'self')}>自分を登録する</button>
    </section> : <>
      <div className="ft-context"><span>{center.display_name}さんを中心に表示</span>
        {selfId && centerId !== selfId && <button type="button" onClick={() => onCenter(selfId)}><RotateCcw/>自分を中心に戻る</button>}</div>
      <section className="ft-graph" aria-label={`${center.display_name}さんの家系図`}>
        {parents.length > 0 && <div className="ft-generation ft-parents">
          {parents.map(item => <PersonNode key={item.relation.id} item={item} label={roleName(item)} onCenter={onCenter} onEdit={chooseEdit}/>)}
        </div>}
        {parents.length > 0 && <div className="ft-line" aria-hidden="true"/>}
        <div className={`ft-generation ft-middle ${spouses.length ? 'has-spouse' : ''}`}>
          <PersonNode item={center} label={centerId === selfId ? '自分' : '中心の人物'} center onCenter={onCenter} onEdit={chooseEdit}/>
          {spouses.map(item => <PersonNode key={item.relation.id} item={item} label="配偶者" onCenter={onCenter} onEdit={chooseEdit}/>)}
        </div>
        {children.length > 0 && <div className="ft-line" aria-hidden="true"/>}
        {children.length > 0 && <div className="ft-generation ft-children">
          {children.map(item => <PersonNode key={item.relation.id} item={item} label="子ども" onCenter={onCenter} onEdit={chooseEdit}/>)}
        </div>}
      </section>
      <div className="ft-add-actions" aria-label="家族を追加する">
        <button type="button" onClick={() => onAdd(centerId,'father')}><Plus/>父を追加</button>
        <button type="button" onClick={() => onAdd(centerId,'mother')}><Plus/>母を追加</button>
        <button type="button" onClick={() => onAdd(centerId,'spouse')}><Plus/>配偶者を追加</button>
        <button type="button" onClick={() => onAdd(centerId,'child')}><Plus/>子どもを追加</button>
      </div>
      <button type="button" className="ft-life" onClick={() => onOpenPerson(centerId)}>
        <FamilyAvatar person={center}/><span><strong>{center.display_name}さんの人生を見る</strong><small>プロフィールと年輪へ</small></span><ChevronRight/>
      </button>
      {!selfId && <p className="ft-hint">自分が未登録です。通常の人物登録から「自分」を登録できます。</p>}
    </>}
    {editing && <div className="ft-editor-backdrop" onClick={() => setEditing(null)}>
      <form className="ft-editor" onClick={event => event.stopPropagation()} onSubmit={async event => {
        event.preventDefault();
        const success = await onEditRelation(editing.relation.id,centerId,editing.person.id,role);
        if (success) setEditing(null);
      }}><h2>{editing.person.display_name}さんとの関係</h2>
        <label>中心人物から見た関係<select value={role} onChange={event => setRole(event.target.value)}>
          <option value="parent">親</option><option value="spouse">配偶者</option><option value="child">子ども</option>
        </select></label>
        <button className="ft-primary">関係を変更する</button>
        <button type="button" className="ft-unlink" onClick={async () => {
          if (!window.confirm('関係だけを解除します。人物は残ります。よろしいですか？')) return;
          const success = await onRemoveRelation(editing.relation.id);
          if (success) setEditing(null);
        }}>この関係を解除する</button>
        <button type="button" className="ft-cancel" onClick={() => setEditing(null)}>閉じる</button>
      </form>
    </div>}
  </main>;
}
