import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Pencil, Plus, RotateCcw, Share2, Users } from 'lucide-react';
import FamilyAvatar from './FamilyAvatar.jsx';
import { FamilyRelationQuestion } from './FamilyRelationshipEditor.jsx';
import { nextMatchingRelationSuggestion, spouseParentsOfChild, treeNeighbors } from './lib/familyTreeModel.js';
import { layoutWholeFamily, roundedTreePath } from './lib/familyTreeLayout.js';
import './family-tree.css';

export { treeNeighbors };

function roleName(item) {
  if (item.relation.relation_type === 'spouse') return '配偶者';
  return item.person.gender === 'female' ? '母' : item.person.gender === 'male' ? '父' : '親';
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
  onOpenPerson, onEditProfile, onHome, onScrollLeft, restoreScrollLeft, restoreScrollTop,
  suggestions = [], promptPersonId = null, onAnswerSuggestion, busy = false }) {
  const [editTargetId, setEditTargetId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [suggestionToConfirm, setSuggestionToConfirm] = useState(null);
  const suggestionShown = useRef(false);
  const [paths, setPaths] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState('focus');
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [boardSize, setBoardSize] = useState({ width:0,height:0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const dragged = useRef(false);
  const graphRef = useRef(null);
  const boardRef = useRef(null);
  const firstLayout = useRef(true);
  const center = people.find(item => item.id === centerId) || null;
  const { parents, spouses, siblings, children } = treeNeighbors(centerId, people, relations);
  const whole = useMemo(() => layoutWholeFamily(people, relations), [people, relations]);
  const printScale = Math.min(1, 1000 / (whole.width || 1), 575 / (whole.height || 1));
  const familyName = people.find(item => item.id === selfId)?.family_name || center?.family_name || '';
  const selectPerson = id => {
    if (viewMode === 'whole') { setViewMode('focus'); setZoom(1); }
    onCenter(id);
  };
  useEffect(() => {
    if (suggestionShown.current) return;
    const pending = suggestions.filter(item => !item.status);
    const next = pending.find(item => promptPersonId
      && [item.person_a_id,item.person_b_id,item.child_id,item.anchor_parent_id]
        .includes(promptPersonId)) || pending[0];
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
      const coupleChildren = new Map();
      for (const edge of parentEdges) {
        const childId = edge.row.person_b_id;
        if (coupleChildren.has(childId)) continue;
        const parentIds = spouseParentsOfChild(relations, childId);
        if (!parentIds) continue;
        const pair = parentIds.map(id => nodes.get(id));
        if (pair.some(node => !node) || pair[0].row !== pair[1].row
          || pair.some(node => node.bottom >= edge.end.top)
          || Math.abs(pair[0].x-pair[1].x) <= pair[0].radius+pair[1].radius) continue;
        coupleChildren.set(childId, { parents:pair, child:edge.end,
          pairKey:[...parentIds].sort().join(':') });
      }
      const separateEdges = parentEdges.filter(edge => !coupleChildren.has(edge.row.person_b_id));
      const lanes = new Map();
      const byRows = new Map();
      separateEdges.forEach(edge => {
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
      const next = separateEdges.map(edge => {
        const key = `${edge.start.row}|${edge.end.row}|${edge.row.person_a_id}`;
        const sameTarget = separateEdges.filter(other => other.row.person_b_id === edge.row.person_b_id
          && other.start.row === edge.start.row);
        const targetIndex = sameTarget.findIndex(other => other.row.id === edge.row.id);
        const sourceX = edge.start.x;
        const targetX = edge.end.x+(targetIndex-(sameTarget.length-1)/2)*9;
        const targetY = edge.end.nameTop-7;
        return { id:edge.row.id, kind:'parent_child', d:roundedTreePath([
          { x:sourceX,y:edge.start.bottom }, { x:sourceX,y:lanes.get(key) },
          { x:targetX,y:lanes.get(key) }, { x:targetX,y:targetY },
        ]) };
      });
      const coupleChildCounts = new Map();
      coupleChildren.forEach(({ pairKey }) => {
        coupleChildCounts.set(pairKey,(coupleChildCounts.get(pairKey) || 0)+1);
      });
      coupleChildren.forEach(({ parents, child, pairKey }, childId) => {
        const [left,right] = parents[0].x < parents[1].x ? parents : [...parents].reverse();
        const gapStart = left.x+left.radius;
        const gapEnd = right.x-right.radius;
        const singleChildInGap = coupleChildCounts.get(pairKey) === 1
          && child.x >= gapStart+6 && child.x <= gapEnd-6;
        const jointX = singleChildInGap ? child.x : (gapStart+gapEnd)/2;
        const jointY = jointX > (gapStart+gapEnd)/2 ? right.middle : left.middle;
        const laneY = (Math.max(left.rowBottom,right.rowBottom)+child.rowTop)/2;
        const targetY = child.nameTop-7;
        next.push({ id:`couple-child-${childId}`, kind:'parent_child', d:singleChildInGap
          ? `M ${jointX} ${jointY} V ${targetY}`
          : roundedTreePath([
            { x:jointX,y:jointY }, { x:jointX,y:laneY },
            { x:child.x,y:laneY }, { x:child.x,y:targetY },
          ]) });
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
      graph.scrollTop = restoreScrollTop || 0;
    } else if (selected) {
      const boardRect = board.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      graph.scrollLeft = selectedRect.left - boardRect.left + selectedRect.width / 2 - graph.clientWidth / 2;
    }
    firstLayout.current = false;
    onScrollLeft?.(graph.scrollLeft, graph.scrollTop);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); };
  }, [centerId, people, relations, zoom, viewMode]);
  useLayoutEffect(() => {
    if (viewMode !== 'whole' || !graphRef.current || !whole.width) return undefined;
    const fit = () => {
      const graph = graphRef.current;
      const scale = Math.min(1, (graph.clientWidth - 28) / whole.width,
        (graph.clientHeight - 28) / whole.height);
      setZoom(Math.max(.12, scale));
      graph.scrollTo(0, 0);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [viewMode, whole.width, whole.height]);
  const pointerDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointers.current.size === 0) dragged.current = false;
    pointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY });
    if (pointers.current.size === 1) gesture.current = { x:event.clientX, y:event.clientY };
    else if (pointers.current.size === 2) gesture.current = { distance:pointerDistance(), zoom };
  };
  const onPointerMove = event => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY });
    if (pointers.current.size === 2 && gesture.current?.distance) {
      dragged.current = true;
      const fit = viewMode === 'whole' ? .12 : Math.min(.55,
        (graphRef.current?.clientWidth || 320) / (boardRef.current?.offsetWidth || 320));
      setZoom(Math.max(fit, Math.min(2.2, gesture.current.zoom * pointerDistance() / gesture.current.distance)));
    } else if (pointers.current.size === 1) {
      if (Math.hypot(event.clientX - (gesture.current?.x ?? event.clientX),
        event.clientY - (gesture.current?.y ?? event.clientY)) > 6 && !dragged.current) {
        dragged.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (dragged.current && graphRef.current) {
        graphRef.current.scrollLeft -= event.clientX - previous.x;
        graphRef.current.scrollTop -= event.clientY - previous.y;
      }
    }
  };
  const onPointerUp = event => {
    pointers.current.delete(event.pointerId);
    const remaining = [...pointers.current.values()][0];
    gesture.current = remaining ? { x:remaining.x, y:remaining.y } : null;
  };
  return <main className="ft-page">
    <header className="ft-header"><button type="button" onClick={onHome} aria-label="家族ホームへ戻る"><ArrowLeft/></button>
      <h1>家系図</h1><span/></header>
    {!center ? <section className="ft-empty"><Users/><h2>家族を一人ずつ、ここから</h2>
      <p>最初に自分を登録すると、家族のつながりを広げられます。</p>
      <button type="button" className="ft-primary" onClick={() => onAdd(null, 'self')}>自分を登録する</button>
    </section> : <>
      <div className="ft-context"><span>{viewMode === 'whole' ? '登録した家族全員を表示' : `${center.display_name}さんを中心に表示`}</span>
        {selfId && centerId !== selfId && viewMode === 'focus' && <button type="button" onClick={() => onCenter(selfId)}><RotateCcw/>自分を中心に戻る</button>}</div>
      <div className="ft-view-controls">
        <button type="button" aria-pressed={viewMode === 'focus'} onClick={() => { setViewMode('focus'); setZoom(1); }}>中心を見る</button>
        <button type="button" aria-pressed={viewMode === 'whole'} onClick={() => setViewMode('whole')}>全体を見る</button>
        <button type="button" onClick={() => setPrintMenuOpen(true)}><Share2 aria-hidden="true"/>共有・印刷</button>
      </div>
      <section ref={graphRef} className={`ft-graph ft-graph-${viewMode}`} aria-label={`${center.display_name}さんの家系図`}
        onScroll={event => onScrollLeft?.(event.currentTarget.scrollLeft, event.currentTarget.scrollTop)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClickCapture={event => { if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; } }}>
        {viewMode === 'whole' ? <div className="ft-board-scale" style={{ width:whole.width*zoom, height:whole.height*zoom }}>
          <div className="ft-full-board" style={{ width:whole.width, height:whole.height, transform:`scale(${zoom})` }}>
            <svg className="ft-connections" viewBox={`0 0 ${whole.width} ${whole.height}`} aria-hidden="true">
              {whole.paths.map(path => <path key={path.id} className={`ft-connection ft-connection-${path.kind}`} d={path.d}/>)}
            </svg>
            {whole.nodes.map(node => <div className="ft-full-node" key={node.person.id}
              style={{ left:node.x, top:node.y }}>
              <PersonNode item={node.person} label={node.person.id === selfId ? '自分' : ''}
                onCenter={selectPerson}/>
            </div>)}
          </div>
        </div> : <div className="ft-board-scale" style={boardSize.width ? {
          width:boardSize.width*zoom,height:boardSize.height*zoom,
        } : undefined}>
        <div ref={boardRef} className="ft-board" style={{ transform:`scale(${zoom})` }}>
          <svg className="ft-connections" aria-hidden="true">
            {paths.map(path => <path key={path.id} className={`ft-connection ft-connection-${path.kind}`} d={path.d}/>)}
          </svg>
          {parents.length > 0 && <div className="ft-generation ft-parents">
            {parents.map(item => <PersonNode key={item.relation.id} item={item} label={roleName(item)} onCenter={selectPerson}/>)}
          </div>}
          <div className="ft-generation ft-middle">
            <PersonNode item={center} label={centerId === selfId ? '自分' : '中心の人物'} center
              onCenter={selectPerson} onEditProfile={setEditTargetId}
              onOpenPage={onOpenPerson}/>
            {spouses.map(item => <PersonNode key={item.relation.id} item={item} label="配偶者" onCenter={selectPerson}/>)}
            {siblings.map(item => <PersonNode key={item.person.id} item={item} label="兄弟姉妹" onCenter={selectPerson}/>)}
          </div>
          {children.length > 0 && <div className="ft-generation ft-children">
            {children.map(item => <PersonNode key={item.relation.id} item={item} label="子ども" onCenter={selectPerson}/>)}
          </div>}
        </div>
        </div>}
      </section>
      <p className="ft-gesture-hint">指で移動・二本指で拡大できます。</p>
      <button type="button" className="ft-add-family" aria-haspopup="dialog" aria-expanded={addOpen}
        onClick={() => setAddOpen(true)}><Plus aria-hidden="true"/><span>家族を追加</span></button>
      {!selfId && <p className="ft-hint">自分が未登録です。通常の人物登録から「自分」を登録できます。</p>}
    </>}
    {center && <section className="ft-print-sheet" aria-label="印刷用の家系図">
      <header><h1>{familyName ? `${familyName}家の家系図` : '家族の家系図'}</h1>
        <time>{new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'long', day:'numeric' }).format(new Date())}</time></header>
      <div className="ft-print-board-wrap" style={{ width:whole.width*printScale, height:whole.height*printScale }}>
        <div className="ft-full-board" style={{ width:whole.width, height:whole.height, transform:`scale(${printScale})` }}>
          <svg className="ft-connections" viewBox={`0 0 ${whole.width} ${whole.height}`} aria-hidden="true">
            {whole.paths.map(path => <path key={path.id} className={`ft-connection ft-connection-${path.kind}`} d={path.d}/>)}
          </svg>
          {whole.nodes.map(node => <div className="ft-print-person" key={node.person.id}
            style={{ left:node.x, top:node.y }}>
            <strong>{node.person.display_name}</strong><span className="ft-print-avatar"><FamilyAvatar person={node.person}/></span>
          </div>)}
        </div>
      </div>
      <footer><span>家族のことを、もっと教えてください。</span><span>縦糸∞横糸</span></footer>
    </section>}
    {printMenuOpen && <div className="ft-suggestion-backdrop" role="presentation">
      <div className="ft-edit-choice" role="dialog" aria-modal="true" aria-label="共有・印刷">
        <h2>家系図を持ち出す</h2>
        <p>登録済みの家族をA4横向きにまとめます。</p>
        <button type="button" onClick={() => { setPrintMenuOpen(false); window.print(); }}>
          家系図をPDFで保存・印刷<ChevronRight/>
        </button>
        <p>印刷画面からPDFとして保存できます。</p>
        <button type="button" className="ft-edit-choice-close" onClick={() => setPrintMenuOpen(false)}>閉じる</button>
      </div>
    </div>}
    {addOpen && <div className="ft-suggestion-backdrop" role="presentation"
      onClick={event => { if (event.target === event.currentTarget) setAddOpen(false); }}>
      <div className="ft-add-choice" role="dialog" aria-modal="true" aria-labelledby="ft-add-choice-title"
        onKeyDown={event => { if (event.key === 'Escape') setAddOpen(false); }}>
        <h2 id="ft-add-choice-title">{center.display_name}さんの家族を追加しますか？</h2>
        <div className="ft-add-choice-options">
          {[['father','父'],['mother','母'],['spouse','配偶者'],['child','子ども']].map(([role,label]) =>
            <button type="button" key={role} onClick={() => { setAddOpen(false); onAdd(centerId,role); }}>
              {label}<ChevronRight aria-hidden="true"/></button>)}
        </div>
        <button type="button" className="ft-add-choice-close" onClick={() => setAddOpen(false)}>閉じる</button>
      </div>
    </div>}
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
          if (await onAnswerSuggestion(item,answer))
            setSuggestionToConfirm(nextMatchingRelationSuggestion(suggestions,item));
        }}/>
      </div>
    </div>}
  </main>;
}
