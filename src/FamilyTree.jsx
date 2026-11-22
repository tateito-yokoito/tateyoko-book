import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Pencil, Plus, RotateCcw, Users } from 'lucide-react';
import FamilyAvatar from './FamilyAvatar.jsx';
import { treeNeighbors } from './lib/familyTreeModel.js';
import './family-tree.css';

export { treeNeighbors };

function roleName(item) {
  if (item.relation.relation_type === 'spouse') return '配偶者';
  return item.person.gender === 'female' ? '母' : item.person.gender === 'male' ? '父' : '親';
}

function PersonNode({ item, label, onCenter, onEdit, onEditProfile, onOpenPage, center = false }) {
  const person = item.person || item;
  return <div className={`ft-node ${center ? 'is-center' : ''}`} data-person-id={person.id}>
    <button type="button" className="ft-node-main" onClick={() => onCenter(person.id)}
      aria-label={`${person.display_name}さんを中心にする`}>
      <strong className="ft-person-name">{person.display_name}</strong>
      <small>{label}</small>
      <span className="ft-avatar-ring"><FamilyAvatar person={person}/></span>
    </button>
    {center && <button type="button" className="ft-profile-edit" onClick={() => onEditProfile(person)}
      aria-label={`${person.display_name}さんのプロフィールを編集する`} title="プロフィールを編集する"><Pencil/></button>}
    {center && <button type="button" className="ft-page-open" onClick={() => onOpenPage(person)}
      aria-label={`${person.display_name}さんの個人ページを開く`} title="個人ページを開く"><BookOpen/></button>}
    {item.relation && <button type="button" className="ft-edit" onClick={() => onEdit(item)}>関係を直す</button>}
  </div>;
}

export default function FamilyTree({ people, relations, selfId, centerId, onCenter, onAdd,
  onOpenPerson, onEditProfile, onHome, onEditRelation, onRemoveRelation }) {
  const [editing, setEditing] = useState(null);
  const [profileToConfirm, setProfileToConfirm] = useState(null);
  const [pageToConfirm, setPageToConfirm] = useState(null);
  const [role, setRole] = useState('parent');
  const [paths, setPaths] = useState([]);
  const graphRef = useRef(null);
  const boardRef = useRef(null);
  const center = people.find(item => item.id === centerId) || null;
  const { parents, spouses, siblings, children } = treeNeighbors(centerId, people, relations);
  useLayoutEffect(() => {
    const board = boardRef.current;
    const graph = graphRef.current;
    if (!board || !graph) return undefined;
    let frame;
    const draw = () => {
      const origin = board.getBoundingClientRect();
      const nodes = new Map([...board.querySelectorAll('[data-person-id]')]
        .map(node => [node.dataset.personId, node.querySelector('.ft-avatar-ring')]));
      const point = (id, edge) => {
        const node = nodes.get(id);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.left - origin.left + rect.width / 2,
          y: rect.top - origin.top + (edge === 'top' ? 0 : edge === 'bottom' ? rect.height : rect.height / 2),
          radius: rect.width / 2 };
      };
      const next = relations.flatMap(row => {
        if (row.relation_type === 'parent_child') {
          const start = point(row.person_a_id, 'bottom');
          const end = point(row.person_b_id, 'top');
          if (!start || !end || end.y <= start.y) return [];
          const bend = (start.y + end.y) / 2;
          return [{ id: row.id, kind: 'parent_child',
            d: `M ${start.x} ${start.y} C ${start.x} ${bend}, ${end.x} ${bend}, ${end.x} ${end.y}` }];
        }
        if (row.relation_type === 'spouse') {
          const a = point(row.person_a_id, 'middle');
          const b = point(row.person_b_id, 'middle');
          if (!a || !b) return [];
          const [left, right] = a.x < b.x ? [a,b] : [b,a];
          return [{ id: row.id, kind: 'spouse',
            d: `M ${left.x + left.radius} ${left.y} L ${right.x - right.radius} ${right.y}` }];
        }
        return [];
      });
      setPaths(next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const observer = new ResizeObserver(schedule);
    observer.observe(board);
    board.querySelectorAll('.ft-avatar-ring').forEach(node => observer.observe(node));
    window.addEventListener('resize', schedule);
    draw();
    const selected = [...board.querySelectorAll('[data-person-id]')]
      .find(node => node.dataset.personId === centerId);
    if (selected) {
      const boardRect = board.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      graph.scrollLeft = selectedRect.left - boardRect.left + selectedRect.width / 2 - graph.clientWidth / 2;
    }
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); };
  }, [centerId, people, relations]);
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
      <section ref={graphRef} className="ft-graph" aria-label={`${center.display_name}さんの家系図`}>
        <div ref={boardRef} className="ft-board">
          <svg className="ft-connections" aria-hidden="true">
            {paths.map(path => <path key={path.id} className={`ft-connection ft-connection-${path.kind}`} d={path.d}/>)}
          </svg>
          {parents.length > 0 && <div className="ft-generation ft-parents">
            {parents.map(item => <PersonNode key={item.relation.id} item={item} label={roleName(item)} onCenter={onCenter} onEdit={chooseEdit}/>)}
          </div>}
          <div className="ft-generation ft-middle">
            <PersonNode item={center} label={centerId === selfId ? '自分' : '中心の人物'} center
              onCenter={onCenter} onEdit={chooseEdit} onEditProfile={setProfileToConfirm}
              onOpenPage={setPageToConfirm}/>
            {spouses.map(item => <PersonNode key={item.relation.id} item={item} label="配偶者" onCenter={onCenter} onEdit={chooseEdit}/>)}
            {siblings.map(item => <PersonNode key={item.person.id} item={item} label="兄弟姉妹" onCenter={onCenter} onEdit={chooseEdit}/>)}
          </div>
          {children.length > 0 && <div className="ft-generation ft-children">
            {children.map(item => <PersonNode key={item.relation.id} item={item} label="子ども" onCenter={onCenter} onEdit={chooseEdit}/>)}
          </div>}
        </div>
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
    {profileToConfirm && <div className="ft-editor-backdrop" onClick={() => setProfileToConfirm(null)}>
      <div className="ft-editor" role="dialog" aria-modal="true" aria-labelledby="ft-profile-confirm-title"
        onClick={event => event.stopPropagation()}>
        <h2 id="ft-profile-confirm-title">{profileToConfirm.display_name}さんのプロフィールを編集しますか？</h2>
        <button type="button" className="ft-primary" onClick={() => {
          onEditProfile(profileToConfirm.id);
          setProfileToConfirm(null);
        }}>プロフィールを編集する</button>
        <button type="button" className="ft-cancel" onClick={() => setProfileToConfirm(null)}>キャンセル</button>
      </div>
    </div>}
    {pageToConfirm && <div className="ft-editor-backdrop" onClick={() => setPageToConfirm(null)}>
      <div className="ft-editor" role="dialog" aria-modal="true" aria-labelledby="ft-page-confirm-title"
        onClick={event => event.stopPropagation()}>
        <h2 id="ft-page-confirm-title">この人の「個人ページ」に移動しますか？</h2>
        <button type="button" className="ft-primary" onClick={() => {
          onOpenPerson(pageToConfirm.id);
          setPageToConfirm(null);
        }}>個人ページを開く</button>
        <button type="button" className="ft-cancel" onClick={() => setPageToConfirm(null)}>キャンセル</button>
      </div>
    </div>}
  </main>;
}
