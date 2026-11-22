import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Pencil, Plus, RotateCcw, Users } from 'lucide-react';
import FamilyAvatar from './FamilyAvatar.jsx';
import { FamilyRelationQuestion } from './FamilyRelationshipEditor.jsx';
import { treeNeighbors } from './lib/familyTreeModel.js';
import './family-tree.css';

export { treeNeighbors };

function roleName(item) {
  if (item.relation.relation_type === 'spouse') return '配偶者';
  return item.person.gender === 'female' ? '母' : item.person.gender === 'male' ? '父' : '親';
}

function roundedRelationPath(points) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length-1; index++) {
    const previous = points[index-1]; const corner = points[index]; const next = points[index+1];
    const beforeLength = Math.hypot(corner.x-previous.x,corner.y-previous.y);
    const afterLength = Math.hypot(next.x-corner.x,next.y-corner.y);
    if (!beforeLength || !afterLength) continue;
    const radius = Math.min(6,beforeLength/2,afterLength/2);
    const before = { x:corner.x-(corner.x-previous.x)*radius/beforeLength,
      y:corner.y-(corner.y-previous.y)*radius/beforeLength };
    const after = { x:corner.x+(next.x-corner.x)*radius/afterLength,
      y:corner.y+(next.y-corner.y)*radius/afterLength };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  return `${path} L ${points.at(-1).x} ${points.at(-1).y}`;
}

function PersonNode({ item, label, onCenter, onEditProfile, onOpenPage, center = false }) {
  const person = item.person || item;
  return <div className={`ft-node ${center ? 'is-center' : ''}`} data-person-id={person.id}>
    <button type="button" className="ft-node-main" onClick={() => onCenter(person.id)}
      aria-label={`${person.display_name}さんを中心にする`}>
      <strong className="ft-person-name">{person.display_name}</strong>
      <small>{label}</small>
      <span className="ft-avatar-ring"><FamilyAvatar person={person}/></span>
    </button>
    {center && <button type="button" className="ft-profile-edit" onClick={() => onEditProfile(person.id)}
      aria-label={`${person.display_name}さんの編集先を選ぶ`} title="編集先を選ぶ"><Pencil/></button>}
    {center && <button type="button" className="ft-page-open" onClick={() => onOpenPage(person.id)}
      aria-label={`${person.display_name}さんの個人ページを開く`} title="個人ページを開く"><BookOpen/></button>}
  </div>;
}

export default function FamilyTree({ people, relations, selfId, centerId, onCenter, onAdd,
  onOpenPerson, onEditProfile, onHome, onScrollLeft, restoreScrollLeft,
  suggestions = [], promptPersonId = null, onAnswerSuggestion, busy = false }) {
  const [editTargetId, setEditTargetId] = useState(null);
  const [suggestionToConfirm, setSuggestionToConfirm] = useState(null);
  const suggestionShown = useRef(false);
  const [paths, setPaths] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [boardSize, setBoardSize] = useState({ width:0,height:0 });
  const pinchRef = useRef(null);
  const graphRef = useRef(null);
  const boardRef = useRef(null);
  const firstLayout = useRef(true);
  const center = people.find(item => item.id === centerId) || null;
  const { parents, spouses, siblings, children } = treeNeighbors(centerId, people, relations);
  useEffect(() => {
    if (!promptPersonId || suggestionShown.current) return;
    const next = suggestions.find(item => !item.status && [item.person_a_id,item.person_b_id,item.child_id]
      .includes(promptPersonId));
    if (next) { suggestionShown.current = true; setSuggestionToConfirm(next); }
  }, [promptPersonId,suggestions]);
  useLayoutEffect(() => {
    const board = boardRef.current;
    const graph = graphRef.current;
    if (!board || !graph) return undefined;
    let frame;
    const draw = () => {
      const origin = board.getBoundingClientRect();
      const width = board.offsetWidth; const height = board.offsetHeight;
      setBoardSize(previous => previous.width === width && previous.height === height
        ? previous : { width,height });
      const nodes = new Map([...board.querySelectorAll('[data-person-id]')].map(node => {
        const rect = node.querySelector('.ft-avatar-ring').getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const rowRect = node.closest('.ft-generation').getBoundingClientRect();
        return [node.dataset.personId, {
          x:(rect.left-origin.left+rect.width/2)/zoom,
          top:(rect.top-origin.top)/zoom, bottom:(rect.bottom-origin.top)/zoom,
          middle:(rect.top-origin.top+rect.height/2)/zoom,
          radius:rect.width/zoom/2, nameTop:(nodeRect.top-origin.top)/zoom,
          row: node.closest('.ft-generation')?.className || '',
          rowTop:(rowRect.top-origin.top)/zoom, rowBottom:(rowRect.bottom-origin.top)/zoom,
        }];
      }));
      const parentEdges = relations.filter(row => row.relation_type === 'parent_child')
        .map(row => ({ row, start: nodes.get(row.person_a_id), end: nodes.get(row.person_b_id) }))
        .filter(edge => edge.start && edge.end && edge.start.bottom < edge.end.top);
      const lanes = new Map();
      const byRows = new Map();
      parentEdges.forEach(edge => {
        const key = `${edge.start.row}|${edge.end.row}`;
        if (!byRows.has(key)) byRows.set(key, []);
        byRows.get(key).push(edge);
      });
      byRows.forEach(edges => {
        const sources = [...new Set(edges.map(edge => edge.row.person_a_id))]
          .sort((a,b) => nodes.get(a).x-nodes.get(b).x);
        const upperBottom = Math.max(...edges.map(edge => edge.start.rowBottom));
        const lowerTop = Math.min(...edges.map(edge => edge.end.rowTop));
        sources.forEach((id,index) => lanes.set(`${edges[0].start.row}|${edges[0].end.row}|${id}`,
          upperBottom+(lowerTop-upperBottom)*(index+1)/(sources.length+1)));
      });
      const next = parentEdges.map(edge => {
        const key = `${edge.start.row}|${edge.end.row}|${edge.row.person_a_id}`;
        const sameTarget = parentEdges.filter(other => other.row.person_b_id === edge.row.person_b_id
          && other.start.row === edge.start.row);
        const targetIndex = sameTarget.findIndex(other => other.row.id === edge.row.id);
        const sourceX = edge.start.x;
        const targetX = edge.end.x+(targetIndex-(sameTarget.length-1)/2)*9;
        const targetY = edge.end.nameTop-7;
        return { id:edge.row.id, kind:'parent_child', d:roundedRelationPath([
          { x:sourceX,y:edge.start.bottom }, { x:sourceX,y:lanes.get(key) },
          { x:targetX,y:lanes.get(key) }, { x:targetX,y:targetY },
        ]) };
      });
      relations.filter(row => row.relation_type === 'spouse').forEach(row => {
        const a = nodes.get(row.person_a_id); const b = nodes.get(row.person_b_id);
        if (!a || !b || a.row !== b.row) return;
        const [left,right] = a.x < b.x ? [a,b] : [b,a];
        const x1 = left.x+left.radius; const x2 = right.x-right.radius;
        if (x2 <= x1) return;
        const mid = (x1+x2)/2;
        next.push({ id:row.id, kind:'spouse', d:`M ${x1} ${left.middle} H ${mid} V ${right.middle} H ${x2}` });
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
    if (firstLayout.current && restoreScrollLeft != null) {
      graph.scrollLeft = restoreScrollLeft;
    } else if (selected) {
      const boardRect = board.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      graph.scrollLeft = selectedRect.left - boardRect.left + selectedRect.width / 2 - graph.clientWidth / 2;
    }
    firstLayout.current = false;
    onScrollLeft?.(graph.scrollLeft);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); };
  }, [centerId, people, relations, zoom]);
  const touchDistance = touches => Math.hypot(touches[0].clientX-touches[1].clientX,
    touches[0].clientY-touches[1].clientY);
  const onTouchStart = event => {
    if (event.touches.length === 2) pinchRef.current = {
      distance:touchDistance(event.touches), zoom,
    };
  };
  const onTouchMove = event => {
    if (event.touches.length !== 2 || !pinchRef.current?.distance) return;
    const fitWidth = (graphRef.current?.clientWidth || 320)/(boardRef.current?.offsetWidth || 320);
    setZoom(Math.max(Math.min(0.55,fitWidth),Math.min(1.5,
      pinchRef.current.zoom*touchDistance(event.touches)/pinchRef.current.distance)));
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
      <section ref={graphRef} className="ft-graph" aria-label={`${center.display_name}さんの家系図`}
        onScroll={event => onScrollLeft?.(event.currentTarget.scrollLeft)}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove}
        onTouchEnd={event => { if (event.touches.length < 2) pinchRef.current = null; }}>
        <div className="ft-board-scale" style={boardSize.width ? {
          width:boardSize.width*zoom,height:boardSize.height*zoom,
        } : undefined}>
        <div ref={boardRef} className="ft-board" style={{ transform:`scale(${zoom})` }}>
          <svg className="ft-connections" aria-hidden="true">
            {paths.map(path => <path key={path.id} className={`ft-connection ft-connection-${path.kind}`} d={path.d}/>)}
          </svg>
          {parents.length > 0 && <div className="ft-generation ft-parents">
            {parents.map(item => <PersonNode key={item.relation.id} item={item} label={roleName(item)} onCenter={onCenter}/>)}
          </div>}
          <div className="ft-generation ft-middle">
            <PersonNode item={center} label={centerId === selfId ? '自分' : '中心の人物'} center
              onCenter={onCenter} onEditProfile={setEditTargetId}
              onOpenPage={onOpenPerson}/>
            {spouses.map(item => <PersonNode key={item.relation.id} item={item} label="配偶者" onCenter={onCenter}/>)}
            {siblings.map(item => <PersonNode key={item.person.id} item={item} label="兄弟姉妹" onCenter={onCenter}/>)}
          </div>
          {children.length > 0 && <div className="ft-generation ft-children">
            {children.map(item => <PersonNode key={item.relation.id} item={item} label="子ども" onCenter={onCenter}/>)}
          </div>}
        </div>
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
    {editTargetId && <div className="ft-suggestion-backdrop" role="presentation">
      <div className="ft-edit-choice" role="dialog" aria-modal="true" aria-label="編集する内容を選ぶ">
        <h2>編集する内容を選ぶ</h2>
        <button type="button" onClick={() => { const id=editTargetId; setEditTargetId(null); onEditProfile(id,'profile'); }}>
          プロフィール<ChevronRight/></button>
        <button type="button" onClick={() => { const id=editTargetId; setEditTargetId(null); onEditProfile(id,'relations'); }}>
          家族関係<ChevronRight/></button>
        <button type="button" className="ft-edit-choice-close" onClick={() => setEditTargetId(null)}>閉じる</button>
      </div>
    </div>}
    {suggestionToConfirm && <div className="ft-suggestion-backdrop" role="presentation">
      <div className="ft-suggestion-sheet" role="dialog" aria-modal="true" aria-label="家族関係の確認">
        <FamilyRelationQuestion item={suggestionToConfirm} busy={busy} onAnswer={async (item,answer) => {
          if (await onAnswerSuggestion(item,answer)) setSuggestionToConfirm(null);
        }}/>
      </div>
    </div>}
  </main>;
}
