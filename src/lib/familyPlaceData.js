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
    .select('id,family_id,display_name,birth_year,death_year,notes,maiden_name,created_at')
    .eq('family_id', familyId).order('created_at');
  if (error) throw error;
  return data || [];
}

export async function addFamilyPlacePerson(client, familyId, name, isSelf) {
  const { data, error } = await client.rpc('create_family_place_person', {
    input_family_id: familyId,
    input_display_name: name.trim(),
    input_is_self: Boolean(isSelf),
  });
  if (error || !data) throw error || new Error('人物を登録できませんでした');
  return data;
}

export async function updateFamilyPlacePerson(client, personId, fields) {
  const payload = {
    display_name: fields.display_name.trim(),
    birth_year: fields.birth_year ? Number(fields.birth_year) : null,
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
    id: 'birth-year', year: person.birth_year, label: '誕生', detail: '',
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
  return data || [];
}

export async function getOrCreateFamilyPlaceStory(client, userId, person, question, visibility) {
  const existing = await client.from('family_free_stories').select('*')
    .eq('person_id', person.id).eq('question_slot', question.slot).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const { data, error } = await client.from('family_free_stories').insert({
    family_id: person.family_id, person_id: person.id,
    question_slot: question.slot, question_key: question.id,
    question_text: question.text, visibility, created_by: userId,
  }).select('*').single();
  if (error?.code === '23505') {
    const retry = await client.from('family_free_stories').select('*')
      .eq('person_id', person.id).eq('question_slot', question.slot).single();
    if (retry.error || !retry.data) throw retry.error || error;
    return retry.data;
  }
  if (error || !data) throw error || new Error('記録を始められませんでした');
  return data;
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
