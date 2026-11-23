// Only a saved parent-child link establishes that this is the viewer's parent.
// Copy is deterministic and never inferred from age or a family label.
export function parentPersonAppeal(person, selfId, relations = [], now = new Date()) {
  if (!person?.id || !selfId || !relations.some(row => row.relation_type === 'parent_child'
    && row.person_a_id === person.id && row.person_b_id === selfId)) return null;

  const parent = person.gender === 'male' ? 'お父さん'
    : person.gender === 'female' ? 'お母さん' : '親御さん';
  const year = Number(person.birth_year);
  const month = Number(person.birth_month);
  const day = Number(person.birth_day);
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    .filter(part => ['year', 'month', 'day'].includes(part.type))
    .map(part => [part.type, Number(part.value)]));
  const todayYear = local.year;
  const todayMonth = local.month;
  const todayDay = local.day;
  let anniversary = null;
  if (Number.isInteger(year) && year > 1800 && month >= 1 && month <= 12
    && day >= 1 && day <= 31 && new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day) {
    const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
    const milestones = new Map([[60, '還暦'], [70, '古希'], [77, '喜寿'], [88, '米寿']]);
    for (const birthdayYear of [todayYear, todayYear + 1]) {
      const milestone = milestones.get(birthdayYear - year);
      const date = Date.UTC(birthdayYear, month - 1, day);
      const daysAway = Math.round((date - today) / 86400000);
      if (milestone && daysAway >= -7 && daysAway <= 30) {
        anniversary = { kind: 'milestone', label: milestone, age: birthdayYear - year };
        break;
      }
    }
    if (!anniversary && todayYear - year >= 65) {
      const firstSeptemberDay = new Date(Date.UTC(todayYear, 8, 1)).getUTCDay();
      const firstMonday = 1 + (8 - firstSeptemberDay) % 7;
      const respectDay = Date.UTC(todayYear, 8, firstMonday + 14);
      const daysAway = Math.round((respectDay - today) / 86400000);
      if (daysAway >= -3 && daysAway <= 14)
        anniversary = { kind:'respect', label:'敬老の日' };
    }
  }
  return {
    parent, variant: anniversary ? 'milestone' : 'usual', anniversary,
    ringHeadline: anniversary?.kind === 'milestone' ? `${anniversary.age}歳の節目に、人生を聞く。`
      : anniversary ? '敬老の日に、人生の話を聞く。'
      : '「いつか聞こう」は、いつか聞けなくなる。',
    bookHeadline: anniversary?.kind === 'milestone' ? `${anniversary.age}歳の節目に、人生を一冊に。`
      : anniversary ? `${parent}の人生を、敬老の日に残せる一冊に。`
      : `${parent}の人生を、家族に残せる一冊に。`,
  };
}
