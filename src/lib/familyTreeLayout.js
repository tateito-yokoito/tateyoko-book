import { spouseParentsOfChild } from './familyTreeModel.js';

export const TREE_NODE_WIDTH = 112;
export const TREE_NODE_HEIGHT = 158;
const ROW_HEIGHT = 216;
const PERSON_GAP = 34;
const FAMILY_GAP = 56;

export function roundedTreePath(points) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const before = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const after = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (!before || !after) continue;
    const radius = Math.min(6, before / 2, after / 2);
    path += ` L ${corner.x - (corner.x - previous.x) * radius / before} ${corner.y - (corner.y - previous.y) * radius / before}`;
    path += ` Q ${corner.x} ${corner.y} ${corner.x + (next.x - corner.x) * radius / after} ${corner.y + (next.y - corner.y) * radius / after}`;
  }
  return `${path} L ${points.at(-1).x} ${points.at(-1).y}`;
}

// A single, deterministic geometry plan drives the full view and its A4 print.
// Only saved parent-child and spouse links can produce lines.
export function layoutWholeFamily(people, relations) {
  if (!people.length) return { width:0, height:0, nodes:[], paths:[] };
  const known = new Set(people.map(person => person.id));
  const order = new Map(people.map((person, index) => [person.id, index]));
  const parent = new Map(people.map(person => [person.id, person.id]));
  const root = id => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current);
    return current;
  };
  for (const link of relations.filter(row => row.relation_type === 'spouse')) {
    if (known.has(link.person_a_id) && known.has(link.person_b_id))
      parent.set(root(link.person_b_id), root(link.person_a_id));
  }
  const groups = new Map();
  people.forEach(person => {
    const id = root(person.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(person);
  });
  const parents = relations.filter(row => row.relation_type === 'parent_child'
    && known.has(row.person_a_id) && known.has(row.person_b_id));
  const groupEdges = new Map([...groups].map(([id]) => [id, new Set()]));
  parents.forEach(link => {
    const a = root(link.person_a_id); const b = root(link.person_b_id);
    if (a !== b) groupEdges.get(a).add(b);
  });
  const level = new Map([...groups].map(([id]) => [id, 0]));
  const indegree = new Map([...groups].map(([id]) => [id, 0]));
  groupEdges.forEach(targets => targets.forEach(id => indegree.set(id, indegree.get(id) + 1)));
  const queue = [...groups.keys()].filter(id => indegree.get(id) === 0);
  for (const id of queue) for (const target of groupEdges.get(id)) {
    level.set(target, Math.max(level.get(target), level.get(id) + 1));
    indegree.set(target, indegree.get(target) - 1);
    if (indegree.get(target) === 0) queue.push(target);
  }
  // Invalid old cycles remain visible rather than disappearing from the chart.
  const rows = new Map();
  groups.forEach((_members, id) => {
    const index = level.get(id);
    if (!rows.has(index)) rows.set(index, []);
    rows.get(index).push(id);
  });
  const rowWidths = new Map();
  const groupOrder = new Map();
  const orderedRows = [...rows].sort(([a], [b]) => a - b).map(([index, ids]) => {
    const familyPosition = id => {
      const sources = parents.filter(link => root(link.person_b_id) === id)
        .map(link => groupOrder.get(root(link.person_a_id))).filter(Number.isFinite);
      return sources.length ? sources.reduce((sum, value) => sum + value, 0) / sources.length : Infinity;
    };
    ids.sort((a, b) => familyPosition(a) - familyPosition(b)
      || Math.min(...groups.get(a).map(item => order.get(item.id)))
        - Math.min(...groups.get(b).map(item => order.get(item.id))));
    ids.forEach((id, position) => groupOrder.set(id, position));
    const width = ids.reduce((sum, id) => sum + groups.get(id).length * TREE_NODE_WIDTH
      + (groups.get(id).length - 1) * PERSON_GAP, 0) + (ids.length - 1) * FAMILY_GAP;
    rowWidths.set(index, width);
    return [index, ids];
  });
  const width = Math.max(360, ...rowWidths.values()) + 48;
  const height = (Math.max(...rows.keys()) + 1) * ROW_HEIGHT - (ROW_HEIGHT - TREE_NODE_HEIGHT) + 48;
  const nodes = [];
  orderedRows.forEach(([index, ids]) => {
    let x = (width - rowWidths.get(index)) / 2;
    ids.forEach((id, groupIndex) => {
      groups.get(id).forEach((person, personIndex) => {
        nodes.push({ person, x, y:24 + index * ROW_HEIGHT, generation:index });
        x += TREE_NODE_WIDTH + (personIndex < groups.get(id).length - 1 ? PERSON_GAP : 0);
      });
      if (groupIndex < ids.length - 1) x += FAMILY_GAP;
    });
  });
  const byId = new Map(nodes.map(node => [node.person.id, node]));
  const mid = node => node.x + TREE_NODE_WIDTH / 2;
  const avatarMid = node => node.y + 95;
  const avatarBottom = node => node.y + 145;
  const nameTop = node => node.y - 8;
  const paths = [];
  relations.filter(row => row.relation_type === 'spouse').forEach(link => {
    const a = byId.get(link.person_a_id); const b = byId.get(link.person_b_id);
    if (!a || !b || a.generation !== b.generation) return;
    const [left, right] = a.x < b.x ? [a,b] : [b,a];
    paths.push({ id:link.id, kind:'spouse', d:roundedTreePath([
      { x:mid(left) + 47, y:avatarMid(left) },
      { x:mid(right) - 47, y:avatarMid(right) },
    ]) });
  });
  const branches = new Map();
  parents.forEach(link => {
    const couple = spouseParentsOfChild(relations, link.person_b_id);
    const pair = couple && couple.every(id => byId.has(id)) ? [...couple].sort() : null;
    const key = `${pair ? `couple:${pair.join(':')}` : `parent:${link.person_a_id}`}|${byId.get(link.person_b_id)?.generation}`;
    if (!branches.has(key)) branches.set(key, { parentIds:pair || [link.person_a_id], childIds:new Set() });
    branches.get(key).childIds.add(link.person_b_id);
  });
  branches.forEach(({ parentIds, childIds }, key) => {
    const upper = parentIds.map(id => byId.get(id)).filter(Boolean);
    const lower = [...childIds].map(id => byId.get(id)).filter(Boolean);
    if (!upper.length || !lower.length) return;
    const paired = upper.length === 2 && upper[0].generation === upper[1].generation;
    const originX = paired ? (mid(upper[0]) + mid(upper[1])) / 2 : mid(upper[0]);
    const originY = paired ? avatarMid(upper[0]) : avatarBottom(upper[0]);
    const junctionY = Math.min(...lower.map(nameTop)) - 28;
    if (junctionY <= originY) return;
    const xs = lower.map(mid);
    paths.push({ id:`trunk:${key}`, kind:'parent_child', d:`M ${originX} ${originY} V ${junctionY}` });
    if (Math.min(originX, ...xs) !== Math.max(originX, ...xs))
      paths.push({ id:`branch:${key}`, kind:'parent_child',
        d:`M ${Math.min(originX, ...xs)} ${junctionY} H ${Math.max(originX, ...xs)}` });
    lower.forEach(child => paths.push({ id:`child:${key}:${child.person.id}`, kind:'parent_child',
      d:`M ${mid(child)} ${junctionY} V ${nameTop(child)}` }));
  });
  return { width, height, nodes, paths };
}
