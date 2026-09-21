export const FAMILY_TEST_REF = 'zpswxefgfabzvxdbtyvq';
import {familyRollout} from './familyRollout.js';

// The server capability is independent of payer, family membership and device.
export const canProduce = workspace => workspace?.role === 'subject' ||
  (workspace?.role === 'supporter' && workspace?.can_produce === true);

export function japaneseMobile(input) {
  let number = String(input || '').normalize('NFKC').replace(/[\s()-]/g, '');
  if (/^0[789]0\d{8}$/.test(number)) number = '+81' + number.slice(1);
  if (!/^\+81[789]0\d{8}$/.test(number)) throw Error('携帯電話番号をご確認ください。');
  return number;
}

export function familyInvitationUrl(origin, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('接続リンクを作成できませんでした。');
  // Fragment is not sent in HTTP requests or Referer headers.
  return `${origin}/?app=1&family_connect=1#connect=${token}`;
}

export function createFamilyApi(client, env = import.meta.env || {}) {
  const url=new URL(client.supabaseUrl);
  if (url.origin !== `https://${FAMILY_TEST_REF}.supabase.co` &&
      !(url.origin==='https://wquxjeqkumossjxehdop.supabase.co' && familyRollout({...env,VITE_SUPABASE_URL:url.origin}).enabled)) {
    throw Error('この環境では制作サポートをご利用いただけません。');
  }
  const rpc = async (name, parameters = {}) => {
    const {data, error} = await client.rpc(name, parameters);
    if (error) throw error;
    return data;
  };
  return {
    list: () => rpc('family_list_workspaces'),
    create: (subject_name, consent, creation_key) => rpc('family_create', {subject_name,consent,creation_key}),
    workspace: p => rpc('family_journey', {p}),
    confirmProduction: (p, supporter, confirmed, mode = 'supporter') => rpc('family_confirm_production_support', {p, supporter, confirmed, mode}),
    productionSupporters: p => rpc('family_list_production_supporters', {p}),
    revokeProduction: (p, supporter) => rpc('family_revoke_production_support', {p, supporter}),
    startChapter: p => rpc('start_paid_starting_chapter', {input_project_id:p,input_subject_intent_confirmed:true}),
    finishChapter: p => rpc('family_finish_starting_chapter', {p}),
    startMain: p => rpc('start_main_experience', {input_project_id:p,input_subject_intent_confirmed:true}),
    themeNavigate: (p, expected, action) => rpc('family_theme_navigate', {p,expected,action}),
    skipQuestion: (p, q) => rpc('family_skip_question', {p,q}),
    enable: (p, consent) => rpc('family_enable', {p, consent: consent === true}),
    issue: (p, phone) => rpc('family_issue_invite', {p, phone: japaneseMobile(phone)}),
    claim: (token, consent) => rpc('family_claim_invite', {token, consent: consent === true}),
    progress: (p, enabled) => rpc('family_set_progress', {p, enabled}),
    share: (a, share) => rpc('family_set_answer_sharing', {a, share}),
    async reserve(p, blob, kind) {
      const inputMime = blob.type.split(';')[0];
      const mime = inputMime === 'audio/x-m4a' ? 'audio/mp4' : inputMime;
      const extension = ({'audio/mp4':'mp4','audio/webm':'webm','audio/aac':'aac',
        'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mime];
      if (!extension || (kind === 'audio' ? !mime.startsWith('audio/') : !mime.startsWith('image/'))) throw Error('対応していないファイル形式です。');
      if (!blob.size || blob.size > 25 * 1024 * 1024) throw Error('ファイルは25MB以内にしてください。');
      const upload = await rpc('family_reserve_upload', {p, kind, extension});
      const {error} = await client.storage.from(upload.bucket).upload(upload.path, blob, {contentType: mime, upsert: false});
      if (error) throw error;
      return upload;
    },
    // Keep upload.id on retry: the DB commit is idempotent, including appends.
    commitRecording: (upload, question, text, continuation = null) => rpc('family_commit_recording', {
      upload_id: upload.id, question_uuid: question, text_value: text, share: false, continuation,
    }),
    commitPhoto: upload => rpc('family_commit_photo', {upload_id: upload.id}),
    async mediaUrl(kind, path) {
      const {data, error} = await client.storage.from(kind === 'photo' ? 'photos' : 'audio').createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
