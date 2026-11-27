import { CHILDHOOD_TRIAL_QUESTIONS } from './childhoodTrial.js';
import { guestTrialRequest } from './guestTrialApi.js';

const tokenPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mimeExtensions = { 'audio/mp4':'m4a', 'audio/aac':'aac', 'audio/webm':'webm',
  'audio/ogg':'ogg', 'audio/mpeg':'mp3' };

async function tokenHash(token) {
  if (!tokenPattern.test(token || '')) throw new Error('体験を確認できません。');
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
}

export async function saveGuestTrialToRing(client, supabaseUrl, session, personId, throughSlot = 3,
  { replaceExisting = false } = {}) {
  if (!uuidPattern.test(personId || '') || !Number.isInteger(throughSlot)
    || throughSlot < 1 || throughSlot > 3) throw new Error('保存先の人物を選んでください。');
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity?.user || identity.user.is_anonymous)
    throw new Error('ログインしてから保存してください。');
  if (replaceExisting && throughSlot !== 3) throw new Error('3問すべてを確認してください。');
  const { data, error } = replaceExisting
    ? await client.rpc('replace_guest_trial_ring_stories', {
      input_token_hash:await tokenHash(session?.token),input_person_id:personId,
    })
    : await client.rpc('save_guest_trial_to_ring', {
      input_token_hash:await tokenHash(session?.token),
      input_person_id:personId, input_through_slot:throughSlot,
    });
  if (error) {
    if (error.code === '23505') {
      const conflict = new Error('この人物には既に別の語りがあります。');
      conflict.code = 'TRIAL_STORY_CONFLICT';
      throw conflict;
    }
    if (error.code === '55000') {
      const started = new Error('BOOK制作を始めたアカウントでは、年輪から語りを追加してください。');
      started.code = 'BOOK_ALREADY_STARTED';
      throw started;
    }
    throw error;
  }
  const stories = data?.stories || [];
  for (const story of stories) {
    if (!story.hasAudio) continue;
    const { data: existing, error: mediaError } = await client.from('family_free_story_media')
      .select('id').eq('story_id',story.storyId).eq('asset_type','audio').limit(1);
    if (mediaError) throw mediaError;
    if (existing?.length) continue;
    const answer = await guestTrialRequest(supabaseUrl,'audio',{
      sessionToken:session.token, questionId:story.questionId,
    });
    const response = await fetch(answer.url,{cache:'no-store'});
    if (!response.ok) throw new Error('録音を保存先へコピーできませんでした。もう一度お試しください。');
    const mime = story.audioMime || (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const extension = mimeExtensions[mime];
    if (!extension) throw new Error('録音の形式を確認できませんでした。');
    const blob = await response.blob();
    const trialKey = (await tokenHash(session.token)).slice(0, 12);
    const path = `${identity.user.id}/${story.storyId}/guest-trial-${story.questionId}-${trialKey}.${extension}`;
    const bucket = client.storage.from('audio');
    const uploaded = await bucket.upload(path,blob,{contentType:mime,upsert:false});
    if (uploaded.error && String(uploaded.error.statusCode) !== '409') throw uploaded.error;
    const { error: insertError } = await client.from('family_free_story_media').insert({
      story_id:story.storyId,asset_type:'audio',storage_bucket:'audio',
      storage_path:path,uploaded_by:identity.user.id,
    });
    if (insertError && insertError.code !== '23505') throw insertError;
  }
  if (replaceExisting) {
    for (const media of data?.retiredMedia || []) {
      if (!media?.bucket || !media?.path) continue;
      // Metadata was retired atomically. A failed byte cleanup cannot expose
      // the old attachment or undo the new, confirmed three-story save.
      await client.storage.from(media.bucket).remove([media.path]).catch(() => {});
    }
  }
  return stories;
}

export async function selfTrialPeople(client) {
  const { data: identity, error: authError } = await client.auth.getUser();
  if (authError || !identity?.user) return [];
  const { data: links, error: linksError } = await client.from('user_person_links')
    .select('person_id').eq('user_id',identity.user.id).eq('role','self');
  if (linksError) throw linksError;
  if (!links?.length) return [];
  const { data: people, error: peopleError } = await client.from('persons')
    .select('id,display_name').in('id',links.map(row => row.person_id));
  if (peopleError) throw peopleError;
  return people || [];
}

export async function guestTrialBookStarted(client) {
  const { data, error } = await client.rpc('guest_trial_book_started');
  if (error) throw error;
  return data === true;
}

export async function linkGuestTrialRingBook(client, token, projectId) {
  const { error } = await client.rpc('link_guest_trial_ring_book', {
    input_token_hash:await tokenHash(token),input_project_id:projectId,
  });
  if (error) throw error;
}

export function trialPersonUrl(personId, location = window.location) {
  if (!uuidPattern.test(personId || '')) throw new Error('人物を確認できません。');
  const url = new URL('/',location.origin);
  url.searchParams.set('guest_trial','1');
  url.searchParams.set('person',personId);
  return url.toString();
}

export function trialPersonStorageKey(personId) {
  return `tateyoko:guest-trial:person:${personId}:v1`;
}

export function trialQuestionCount() { return CHILDHOOD_TRIAL_QUESTIONS.length; }
