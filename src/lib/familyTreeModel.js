// The visible tree is always relative to its center. Siblings are derived only
// from a parent-child link to a parent that is also linked to the center.
export function treeNeighbors(centerId, people, relations) {
  const byId = new Map(people.map(person => [person.id, person]));
  const related = (type, test, pick) => relations.filter(row => row.relation_type === type && test(row))
    .map(row => ({ relation: row, person: byId.get(pick(row)) })).filter(item => item.person);
  const parents = related('parent_child', row => row.person_b_id === centerId, row => row.person_a_id);
  const parentIds = new Set(parents.map(item => item.person.id));
  const spouses = related('spouse', row => row.person_a_id === centerId || row.person_b_id === centerId,
    row => row.person_a_id === centerId ? row.person_b_id : row.person_a_id);
  const children = related('parent_child', row => row.person_a_id === centerId, row => row.person_b_id);
  const alreadyShown = new Set([centerId, ...parentIds,
    ...spouses.map(item => item.person.id), ...children.map(item => item.person.id)]);
  const siblings = related('parent_child', row => parentIds.has(row.person_a_id)
    && row.person_b_id !== centerId, row => row.person_b_id)
    .filter(item => {
      if (alreadyShown.has(item.person.id)) return false;
      alreadyShown.add(item.person.id);
      return true;
    }).map(item => ({ person: item.person, relation: null }));
  return { parents, spouses, siblings, children };
}

// Suggestions are derived from saved links. A suggestion is never a relation
// until the person explicitly answers yes and the relation insert succeeds.
export function familyRelationSuggestions(people, relations, decisions = []) {
  const byId = new Map(people.map(person => [person.id,person]));
  const parentsByChild = new Map();
  const spousePairs = new Set();
  relations.forEach(row => {
    if (row.relation_type === 'parent_child') {
      if (!parentsByChild.has(row.person_b_id)) parentsByChild.set(row.person_b_id, new Set());
      parentsByChild.get(row.person_b_id).add(row.person_a_id);
    } else if (row.relation_type === 'spouse') {
      spousePairs.add([row.person_a_id,row.person_b_id].sort().join(':'));
    }
  });
  const decisionByKey = new Map(decisions.map(row =>
    [`${row.kind}:${row.person_a_id}:${row.person_b_id}`,row.status]));
  const suggestions = new Map();
  const add = (kind,a,b,childId) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    const key = `${kind}:${a}:${b}`;
    if (suggestions.has(key)) return;
    suggestions.set(key, { key,kind,person_a_id:a,person_b_id:b,child_id:childId,
      status:decisionByKey.get(key) || null,personA:byId.get(a),personB:byId.get(b) });
  };
  parentsByChild.forEach((parents,childId) => {
    const list = [...parents].sort();
    for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++) {
      if (!spousePairs.has(`${list[i]}:${list[j]}`)) add('shared_child_spouse',list[i],list[j],childId);
    }
  });
  relations.filter(row => row.relation_type === 'spouse').forEach(row => {
    for (const [parent,other] of [[row.person_a_id,row.person_b_id],[row.person_b_id,row.person_a_id]]) {
      parentsByChild.forEach((parents,childId) => {
        if (parents.size >= 2 || !parents.has(parent) || parents.has(other) || childId === other) return;
        add('spouse_child_parent',other,childId,childId);
      });
    }
  });
  return [...suggestions.values()].filter(item => item.status !== 'declined' && item.status !== 'accepted');
}
