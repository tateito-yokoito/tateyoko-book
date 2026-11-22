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
