const stageForAge = age => age < 13 ? 'child' : age < 25 ? 'young'
  : age < 55 ? 'adult' : age < 75 ? 'mature' : 'senior';

// The inferred stage is only a visual fallback. It never changes a person's
// profile, and a saved birth year always takes precedence over relationships.
export function avatarStage(person, now = new Date(), relations = [], people = []) {
  if (person?.birth_year) return stageForAge(now.getFullYear() - Number(person.birth_year));
  if (!person?.id) return 'unknown';
  const personById = new Map(people.map(item => [item.id, item]));
  const referenceYear = Number(person.death_year) || now.getFullYear();
  let estimatedAge = null;
  for (const relation of relations) {
    if (relation.relation_type !== 'parent_child' || relation.person_a_id !== person.id) continue;
    const child = personById.get(relation.person_b_id);
    if (!child) continue;
    const childYear = Number(child?.birth_year);
    const childAge = childYear && childYear <= referenceYear ? referenceYear - childYear : null;
    const estimate = childAge === null ? 25 : Math.max(25, childAge + 18);
    estimatedAge = Math.max(estimatedAge || 0, estimate);
  }
  return estimatedAge === null ? 'unknown' : stageForAge(estimatedAge);
}
