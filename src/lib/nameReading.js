const readingFields = {
  family_name:'family_name_kana',
  given_name:'given_name_kana',
  maiden_name:'maiden_name_kana',
};

export function kanaFieldForName(field) { return readingFields[field] || null; }

export function normalizeKanaReading(text) {
  const value = String(text || '').normalize('NFKC').trim();
  if (!value || !/^[\u3041-\u3096\u30a1-\u30f6ー・\s]+$/u.test(value)) return '';
  return value.replace(/[\u30a1-\u30f6]/gu, letter =>
    String.fromCharCode(letter.charCodeAt(0)-0x60)).replace(/\s+/gu,' ');
}

export function hasKanji(text) { return /\p{Script=Han}/u.test(String(text || '')); }

export function knownFamilyReading(people, field, name) {
  const kanaField = kanaFieldForName(field);
  if (!kanaField || !String(name || '').trim()) return '';
  const readings = new Set(people.filter(person => String(person[field] || '').trim() === name.trim())
    .map(person => normalizeKanaReading(person[kanaField])).filter(Boolean));
  return readings.size === 1 ? [...readings][0] : '';
}

export function suggestNameReading(people, field, name, imeReading = '') {
  if (!hasKanji(name)) return '';
  return normalizeKanaReading(imeReading) || knownFamilyReading(people,field,name);
}
