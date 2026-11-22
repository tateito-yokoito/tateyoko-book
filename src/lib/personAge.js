const tokyoDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
});

export function currentPersonAge(person, now = new Date()) {
  const year = Number(person?.birth_year);
  const month = Number(person?.birth_month);
  const day = Number(person?.birth_day);
  if (person?.death_year || !Number.isInteger(year) || !Number.isInteger(month)
    || !Number.isInteger(day) || year < 1 || month < 1 || month > 12 || day < 1) return null;
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() + 1 !== month
    || birth.getUTCDate() !== day) return null;
  const today = Object.fromEntries(tokyoDate.formatToParts(now)
    .filter(part => ['year','month','day'].includes(part.type))
    .map(part => [part.type, Number(part.value)]));
  const age = today.year - year - (today.month < month
    || (today.month === month && today.day < day) ? 1 : 0);
  return age >= 0 ? age : null;
}
