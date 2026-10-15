export const SUPPORTER_RELATIONSHIPS = [
  ['child', '子'], ['spouse', '配偶者・パートナー'], ['sibling', '兄弟姉妹'],
  ['grandchild', '孫'], ['parent', '親'], ['relative', 'その他の親族'],
  ['friend', '友人・知人'], ['other', 'その他']
];

export function relationshipLabel(value, other = '') {
  if (value === 'other' && other) return other;
  return SUPPORTER_RELATIONSHIPS.find(([key]) => key === value)?.[1] || '関係未登録';
}

export function supporterIdentityFromProfile(profile) {
  // Never split a legacy full name or promote the placeholder into a real name.
  const name = value => value?.trim() === 'あなた' ? '' : String(value || '').trim();
  return { familyName: name(profile?.family_name), givenName: name(profile?.given_name), relationship: '', other: '' };
}

export function supporterIdentityError(value) {
  if (![value.familyName, value.givenName].every(part => {
    const name = String(part || '').trim();
    return name && name !== 'あなた' && [...name].length <= 80;
  })) return '姓・名を入力してください。';
  if (!SUPPORTER_RELATIONSHIPS.some(([key]) => key === value.relationship)) return '物語のご本人から見た関係を選んでください。';
  if (value.relationship === 'other' && (!value.other?.trim() || [...value.other.trim()].length > 80)) return '関係を80文字以内で入力してください。';
  return '';
}

export function supporterIdentityParams(value) {
  return {
    input_family_name: value.familyName.trim(), input_given_name: value.givenName.trim(),
    input_relationship: value.relationship,
    input_relationship_other: value.relationship === 'other' ? value.other.trim() : null
  };
}
