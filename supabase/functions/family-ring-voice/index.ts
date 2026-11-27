import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { buildAnswerPrompt, buildTranscriptionPrompt } from '../_shared/story-ai-prompts.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {status, headers:cors});
const outputText = (response: Record<string, unknown>) =>
  (Array.isArray(response.output) ? response.output : [])
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((part: any) => part?.text || '').join('').trim();

serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null,{headers:cors});
  if (request.method !== 'POST') return reply({success:false,error:'Method not allowed'},405);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    if (!url || !anonKey || !serviceKey || !openaiKey) throw new Error('Server unavailable');
    const authorization = request.headers.get('Authorization') || '';
    const client = createClient(url,anonKey,{global:{headers:{Authorization:authorization}}});
    const {data:{user},error:userError} = await client.auth.getUser();
    if (userError || !user) return reply({success:false,error:'Unauthorized'},401);
    const service = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const form = await request.formData();
    const mode = String(form.get('mode') || 'analyze');
    const source = String(form.get('source') || 'book');
    const answerId = String(form.get('answerId') || '');
    const audio = form.get('audio');
    const mime = audio instanceof File ? audio.type.split(';')[0].replace('audio/x-m4a','audio/mp4') : '';
    const ext = ({'audio/mp4':'m4a','audio/webm':'webm','audio/aac':'aac',
      'audio/mpeg':'mp3','audio/ogg':'ogg','audio/wav':'wav'} as Record<string,string>)[mime];
    if (!['analyze','commit'].includes(mode) || !['book','free'].includes(source)
      || !/^[0-9a-f-]{36}$/i.test(answerId)
      || !(audio instanceof File) || !ext || !audio.size || audio.size > 15*1024*1024)
      return reply({success:false,error:'録音を確認してください。15MB以内の音声に対応しています。'},400);
    if (source === 'free') {
      const {data:story,error:storyError} = await service.from('family_free_stories')
        .select('id,person_id,created_by').eq('id',answerId).maybeSingle();
      const [{data:self,error:selfError},{data:access,error:accessError}] = await Promise.all([
        client.rpc('family_ring_is_self',{input_person_id:story?.person_id || null}),
        client.rpc('family_place_access_allowed'),
      ]);
      if (storyError || !story || selfError || accessError || self !== true || access !== true)
        return reply({success:false,error:'Forbidden'},403);
    }
    if (source === 'book') {
    const {data:answer,error:answerError} = await service.from('answers')
      .select('id,book_project_id,subject_person_id,user_question_id,text_revision,access_override,sequence_order')
      .eq('id',answerId).maybeSingle();
    if (answerError || !answer?.subject_person_id || !answer.book_project_id)
      return reply({success:false,error:'Forbidden'},403);
    const [{data:self,error:selfError},{data:access,error:accessError},{data:project,error:projectError}] = await Promise.all([
      client.rpc('family_ring_is_self',{input_person_id:answer.subject_person_id}),
      client.rpc('family_place_access_allowed'),
      service.from('book_projects').select('subject_person_id,access_status')
        .eq('id',answer.book_project_id).maybeSingle(),
    ]);
    if (selfError || accessError || projectError || self !== true || access !== true
      || project?.subject_person_id !== answer.subject_person_id
      || !['paid','gifted','legacy'].includes(project?.access_status || ''))
      return reply({success:false,error:'Forbidden'},403);
    const {data:question} = answer.user_question_id
      ? await service.from('user_questions').select('status,answered_at')
        .eq('id',answer.user_question_id).eq('book_project_id',answer.book_project_id).maybeSingle()
      : {data:null};
    const {data:manifest} = await service.from('book_work_manifests')
      .select('answer_ids,confirmed_at').eq('book_project_id',answer.book_project_id)
      .not('confirmed_at','is',null);
    const frozen = (manifest || []).some((row: any) =>
      Array.isArray(row.answer_ids) && row.answer_ids.includes(answerId));
    if (!(question?.status === 'answered' || question?.answered_at || frozen))
      return reply({success:false,error:'保存済みの語りだけ編集できます。'},403);
    }

    if (mode === 'analyze') {
      const duration = Number(form.get('durationSeconds'));
      if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
        return reply({success:false,error:'録音時間を確認してください。'},400);
      const questionText = String(form.get('questionText') || '').slice(0,1000);
      const transcriptionForm = new FormData();
      transcriptionForm.append('file',audio,`year-ring.${ext}`);
      transcriptionForm.append('model','gpt-4o-mini-transcribe');
      transcriptionForm.append('language','ja');
      transcriptionForm.append('temperature','0');
      transcriptionForm.append('prompt',buildTranscriptionPrompt(questionText,[],''));
      const transcription = await fetch('https://api.openai.com/v1/audio/transcriptions',{
        method:'POST',headers:{Authorization:`Bearer ${openaiKey}`},body:transcriptionForm,
        signal:AbortSignal.timeout(50000),
      });
      if (!transcription.ok) throw new Error('Transcription failed');
      const raw = String((await transcription.json())?.text || '').trim();
      if (!raw) return reply({success:false,error:'声を文字にできませんでした。もう一度お試しください。'},422);
      let polished: Record<string,unknown> = {};
      try {
        const response = await fetch('https://api.openai.com/v1/responses',{
          method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},
          body:JSON.stringify({model:'gpt-4.1-mini',input:[
            {role:'system',content:'あなたは家族の語りを本にする日本語編集者です。必ずJSONのみを返してください。'},
            {role:'user',content:buildAnswerPrompt(questionText,raw)},
          ],temperature:0.4,max_output_tokens:3300}),signal:AbortSignal.timeout(30000),
        });
        if (response.ok) polished=JSON.parse(outputText(await response.json()));
      } catch { /* The raw transcript remains usable when polish fails. */ }
      return reply({success:true,transcript_raw:raw,
        transcript_readable:String(polished.transcript_readable || raw),
        transcript_essay:String(polished.transcript_essay || '')});
    }

    if (source === 'free') {
      const expectedRevision = Number(form.get('expectedRevision'));
      const body = String(form.get('body') || '').trim();
      const duration = Number(form.get('durationSeconds'));
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !body
        || body.length > 100000 || !Number.isFinite(duration) || duration <= 0 || duration > 600)
        return reply({success:false,error:'語りの保存内容を確認してください。'},400);
      const path = `${user.id}/${answerId}/${crypto.randomUUID()}.${ext}`;
      const uploaded = await service.storage.from('family-free-media').upload(path,audio,
        {contentType:mime,upsert:false});
      if (uploaded.error) throw uploaded.error;
      let mediaId = '';
      try {
        const inserted = await client.from('family_free_story_media').insert({
          story_id:answerId,asset_type:'audio',storage_bucket:'family-free-media',
          storage_path:path,uploaded_by:user.id,duration_seconds:Math.round(duration),
        }).select('id').single();
        if (inserted.error || !inserted.data) throw inserted.error || new Error('Media unavailable');
        mediaId=inserted.data.id;
        const saved = await service.from('family_free_stories')
          .update({body,revision:expectedRevision+1,updated_at:new Date().toISOString()})
          .eq('id',answerId).eq('revision',expectedRevision).select('id,body,revision').maybeSingle();
        if (saved.error || !saved.data) throw saved.error || new Error('Story changed');
        return reply({success:true,story:saved.data});
      } catch (error) {
        if (mediaId) await client.from('family_free_story_media').delete().eq('id',mediaId);
        await service.storage.from('family-free-media').remove([path]);
        throw error;
      }
    }
    const {data:answer} = await service.from('answers')
      .select('book_project_id,subject_person_id,user_question_id,sequence_order,user_id')
      .eq('id',answerId).single();
    if (!answer) return reply({success:false,error:'Forbidden'},403);

    const body = String(form.get('body') || '').trim();
    const expectedRevision = Number(form.get('expectedRevision'));
    const locked = String(form.get('private')) === 'true';
    if (!body || body.length > 100000 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      return reply({success:false,error:'語りの保存内容を確認してください。'},400);
    const {data:confirmed} = await service.from('book_work_manifests')
      .select('answer_ids').eq('book_project_id',answer.book_project_id)
      .not('confirmed_at','is',null);
    const frozen = (confirmed || []).some((row: any) =>
      Array.isArray(row.answer_ids) && row.answer_ids.includes(answerId));
    const bucket = frozen ? 'family-ring-media' : 'audio';
    const path = frozen ? `${user.id}/${answerId}/${crypto.randomUUID()}.${ext}`
      : `${user.id}/${answer.book_project_id}/${answerId}/part-${crypto.randomUUID()}.${ext}`;
    if (!frozen) {
      if (answer.user_id !== user.id || !answer.user_question_id || !answer.sequence_order)
        return reply({success:false,error:'この語りの録音はBOOK制作画面から追加してください。'},403);
      const reserved = await client.rpc('reserve_recording_audio_upload',{
        input_project_id:answer.book_project_id,input_question_id:answer.user_question_id,
        input_answer_id:answerId,
      });
      if (reserved.error) return reply({success:false,error:'録音の保存先を確認できませんでした。'},403);
      const attemptId = crypto.randomUUID();
      const attempt = await client.from('answer_recording_attempts').insert({
        id:attemptId,user_id:user.id,book_project_id:answer.book_project_id,
        sequence_order:answer.sequence_order,answer_id:answerId,mode:'append',storage_paths:[path],
      });
      if (attempt.error) throw attempt.error;
      try {
        const uploaded = await service.storage.from('audio').upload(path,audio,{contentType:mime,upsert:false});
        if (uploaded.error) throw uploaded.error;
        const {data:committed,error:commitError} = await client.rpc('commit_answer_recording_with_segments',{
          input_attempt_id:attemptId,input_base_text_revision:expectedRevision,
          input_body:body,input_transcript_raw:String(form.get('raw') || ''),
          input_transcript_clean:String(form.get('raw') || ''),
          input_transcript_readable:String(form.get('readable') || ''),
          input_transcript_essay:String(form.get('essay') || ''),
          input_selected_style:String(form.get('style') || 'readable'),
          input_segment_transcripts:[String(form.get('raw') || '')],
          input_allow_rewrite:true,
        });
        if (commitError || committed?.status !== 'saved')
          throw commitError || new Error(committed?.status || 'Recording failed');
        return reply({success:true,story:{body,text_revision:committed.text_revision}});
      } catch (error) {
        await service.storage.from('audio').remove([path]);
        await service.from('answer_recording_attempts').delete().eq('id',attemptId).eq('state','planned');
        throw error;
      }
    }
    const uploaded = await service.storage.from(bucket).upload(path,audio,{contentType:mime,upsert:false});
    if (uploaded.error) throw uploaded.error;
    let mediaId = '';
    try {
      const {data:person,error:personError} = await service.from('persons')
        .select('family_id').eq('id',answer.subject_person_id).single();
      if (personError || !person) throw personError || new Error('Person unavailable');
      const inserted = frozen
        ? await client.from('family_ring_story_media').insert({
          answer_id:answerId,person_id:answer.subject_person_id,
          storage_path:path,uploaded_by:user.id,asset_type:'audio',
        }).select('id').single()
        : await client.from('media_assets').insert({
          answer_id:answerId,user_id:user.id,asset_type:'audio',storage_path:path,
          book_project_id:answer.book_project_id,
          person_id:answer.subject_person_id,family_id:person.family_id,is_primary:false,
          meta_json:{source:'year_ring_addendum'},
        }).select('id').single();
      if (inserted.error || !inserted.data) throw inserted.error || new Error('Media unavailable');
      mediaId=inserted.data.id;
      const updated = await client.rpc('family_ring_update_book_story',{
        input_answer_id:answerId,input_expected_revision:expectedRevision,
        input_body:body,input_private:locked,
      });
      if (updated.error || !updated.data) throw updated.error || new Error('Story changed');
      return reply({success:true,story:updated.data});
    } catch (error) {
      if (mediaId) await client.from(frozen ? 'family_ring_story_media' : 'media_assets').delete().eq('id',mediaId);
      await service.storage.from(bucket).remove([path]);
      throw error;
    }
  } catch (error) {
    console.error('family-ring-voice failed',error instanceof Error ? error.message : 'Unknown error');
    return reply({success:false,error:'声を処理・保存できませんでした。録音を残したまま、もう一度お試しください。'},500);
  }
});
