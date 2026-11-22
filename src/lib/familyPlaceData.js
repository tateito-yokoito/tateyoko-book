// Free family-place records are person-centred. They never create or update a
// BOOK project, answer, purchase, or question-progress row.
export async function ensureFamilyPlace(client, user, label) {
  if (!user?.id) throw new Error('ログインしてください');
  const { data, error } = await client.rpc('ensure_family_place_home', {
    input_family_name: label || null,
  });
  if (error || !data) throw error || new Error('家族の場所を開けませんでした');
  return data;
}

export async function familyPlacePeople(client, familyId) {
  const { data, error } = await client.from('persons')
    .select('id,family_id,display_name,family_name,given_name,birth_year,birth_month,birth_day,death_year,notes,maiden_name,created_at')
    .eq('family_id', familyId).order('created_at');
  if (error) throw error;
  return data || [];
}

export async function familyPlacePublishedBooks(client, personId) {
  const { data, error } = await client.rpc('list_family_place_person_books', {
    input_person_id: personId,
  });
  if (error) throw error;
  return (data || []).filter(row => row.public_id)
    .sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0));
}

export function personNameParts(person) {
  if (person?.family_name || person?.given_name) return {
    family_name: person.family_name || '', given_name: person.given_name || '',
  };
  // Legacy records have only display_name. Preserve the complete name even
  // when it has no separator; never guess a split within Japanese text.
  const parts = String(person?.display_name || '').trim().split(/[\s\u3000]+/);
  return parts.length > 1
    ? { family_name: parts.shift(), given_name: parts.join(' ') }
    : { family_name: parts[0] || '', given_name: '' };
}

export async function addFamilyPlacePerson(client, familyId, fields, isSelf) {
  const { data, error } = await client.rpc('create_family_place_person_profile', {
    input_family_id: familyId,
    input_family_name: fields.family_name.trim(),
    input_given_name: fields.given_name.trim(),
    input_is_self: Boolean(isSelf),
    input_birth_year: fields.birth_year ? Number(fields.birth_year) : null,
    input_birth_month: fields.birth_month ? Number(fields.birth_month) : null,
    input_birth_day: fields.birth_day ? Number(fields.birth_day) : null,
  });
  if (error || !data) throw error || new Error('人物を登録できませんでした');
  return data;
}

export async function updateFamilyPlacePerson(client, personId, fields) {
  const familyName = fields.family_name.trim();
  const givenName = fields.given_name.trim();
  const payload = {
    family_name: familyName || null,
    given_name: givenName || null,
    display_name: [familyName,givenName].filter(Boolean).join(' '),
    birth_year: fields.birth_year ? Number(fields.birth_year) : null,
    birth_month: fields.birth_month ? Number(fields.birth_month) : null,
    birth_day: fields.birth_day ? Number(fields.birth_day) : null,
    death_year: fields.death_year ? Number(fields.death_year) : null,
    maiden_name: fields.maiden_name?.trim() || null,
    notes: fields.notes?.trim() || null,
  };
  const { data, error } = await client.from('persons').update(payload)
    .eq('id', personId).select('id').single();
  if (error || !data) throw error || new Error('プロフィールを保存できませんでした');
}

export async function familyPlaceFacts(client, personId) {
  const { data, error } = await client.from('family_person_profile_facts')
    .select('*').eq('person_id', personId)
    .order('event_year', { ascending: true, nullsFirst: false })
    .order('event_month', { ascending: true, nullsFirst: false })
    .order('event_day', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function saveFamilyPlaceFact(client, userId, person, fact) {
  const payload = {
    person_id: person.id, family_id: person.family_id,
    fact_type: fact.fact_type, label: fact.label.trim(),
    event_year: fact.event_year ? Number(fact.event_year) : null,
    event_month: fact.event_month ? Number(fact.event_month) : null,
    event_day: fact.event_day ? Number(fact.event_day) : null,
    detail: fact.detail?.trim() || '', created_by: userId,
  };
  const query = fact.id
    ? client.from('family_person_profile_facts').update(payload).eq('id', fact.id)
    : client.from('family_person_profile_facts').insert(payload);
  const { data, error } = await query.select('id').single();
  if (error || !data) throw error || new Error('出来事を保存できませんでした');
  return data.id;
}

export function familyPlaceTimeline(person, facts) {
  const events = [];
  if (person?.birth_year) events.push({
    id: 'birth-year', year: person.birth_year,
    month: person.birth_month, day: person.birth_day, label: '誕生', detail: '',
  });
  if (person?.death_year) events.push({
    id: 'death-year', year: person.death_year, label: '逝去', detail: '',
  });
  for (const fact of facts || []) {
    // Birth/death years on Person are the canonical profile fields.
    if (fact.fact_type === 'birth' && person?.birth_year) continue;
    if (fact.fact_type === 'death' && person?.death_year) continue;
    events.push({ id: fact.id, year: fact.event_year,
      month: fact.event_month, day: fact.event_day,
      label: fact.label, detail: fact.detail || '' });
  }
  return events.sort((a, b) =>
    (a.year ?? 9999) - (b.year ?? 9999)
    || (a.month ?? 0) - (b.month ?? 0)
    || (a.day ?? 0) - (b.day ?? 0));
}

export async function familyPlaceStories(client, personId) {
  const { data, error } = await client.from('family_free_stories')
    .select('id,family_id,person_id,question_slot,question_key,question_text,body,transcript_raw,transcript_readable,transcript_essay,visibility,revision,created_at,updated_at')
    .eq('person_id', personId).order('question_slot');
  if (error) throw error;
  if (!data?.length) return [];
  const { data: media, error: mediaError } = await client.from('family_free_story_media')
    .select('story_id').in('story_id', data.map(item => item.id));
  if (mediaError) throw mediaError;
  const counts = new Map();
  for (const item of media || []) counts.set(item.story_id, (counts.get(item.story_id) || 0) + 1);
  return data.map(item => ({ ...item, media_count: counts.get(item.id) || 0 }));
}

export async function getOrCreateFamilyPlaceStory(client, userId, person, question, visibility) {
  const existing = await client.from('family_free_stories').select('*')
    .eq('person_id', person.id).eq('question_slot', question.slot).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  // A story SELECT policy checks the stored row. Read it in the next request;
  // INSERT ... RETURNING cannot see it through that policy in the same command.
  const { error } = await client.from('family_free_stories').insert({
    family_id: person.family_id, person_id: person.id,
    question_slot: question.slot, question_key: question.id,
    question_text: question.text, visibility, created_by: userId,
  });
  if (error && error.code !== '23505') throw error;
  const saved = await client.from('family_free_stories').select('*')
    .eq('person_id', person.id).eq('question_slot', question.slot).single();
  if (saved.error || !saved.data) throw saved.error || new Error('記録を開けませんでした');
  return saved.data;
}

export async function saveFamilyPlaceStory(client, story, values) {
  const { data, error } = await client.from('family_free_stories')
    .update({
      body: values.body, transcript_raw: values.transcript_raw,
      transcript_readable: values.transcript_readable,
      transcript_essay: values.transcript_essay,
      revision: story.revision + 1, updated_at: new Date().toISOString(),
    }).eq('id', story.id).eq('revision', story.revision)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('別の端末で変更されました。再読み込みして確認してください');
  return data;
}

export async function setFamilyPlaceStoryVisibility(client, story, visibility) {
  if (!['private', 'family'].includes(visibility)) throw new Error('公開範囲を選んでください');
  const { data, error } = await client.from('family_free_stories')
    .update({ visibility, revision: story.revision + 1, updated_at: new Date().toISOString() })
    .eq('id', story.id).eq('revision', story.revision).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('別の端末で変更されました。再読み込みして確認してください');
  return data;
}

export async function familyPlaceMedia(client, storyId) {
  const { data, error } = await client.from('family_free_story_media')
    .select('id,story_id,asset_type,storage_path,duration_seconds,created_at')
    .eq('story_id', storyId).order('created_at');
  if (error) throw error;
  return Promise.all((data || []).map(async item => {
    const signed = await client.storage.from('family-free-media')
      .createSignedUrl(item.storage_path, 3600);
    if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('メディアを開けません');
    return { ...item, url: signed.data.signedUrl };
  }));
}

export async function addFamilyPlaceMedia(client, userId, storyId, file, kind, durationSeconds = null) {
  if (!['photo', 'audio'].includes(kind) || !file?.size) throw new Error('ファイルを選んでください');
  const ext = kind === 'photo'
    ? (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg')
    : (file.type.includes('webm') ? 'webm' : 'mp4');
  const path = `${userId}/${storyId}/${crypto.randomUUID()}.${ext}`;
  const uploaded = await client.storage.from('family-free-media').upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  const { data, error } = await client.from('family_free_story_media').insert({
    story_id: storyId, asset_type: kind, storage_path: path,
    uploaded_by: userId, duration_seconds: durationSeconds,
  }).select('id').single();
  if (error || !data) {
    await client.storage.from('family-free-media').remove([path]).catch(() => {});
    throw error || new Error('ファイルの登録に失敗しました');
  }
  return { id: data.id, path };
}
