// Question capability, not a hard-coded video type/slot in the storage model.
export const BOOK_MILESTONES_ENABLED = import.meta.env?.VITE_BOOK_MILESTONES_ENABLED === 'true';
export const OPENING_TEXT = '縦糸横糸を始めることになったきっかけや、これから人生を振り返っていく今の気持ちを聞かせてください。';
export const OPENING_HINTS = ['始めようと思ったきっかけ', '誰かから贈られた方は、そのときのこと', 'これから語ってみたいこと', '始める今、感じていること'];
export const CLOSING_TEXT = 'ここまで人生を振り返ってみて、今どんなことを感じていますか？';
export const CLOSING_HINT = 'まとまっていなくても構いません。今浮かんでいることを、自由にお話しください。';
export function isMilestone(q) {
  return (q?.answer_formats || q?.meta_json?.answer_formats || []).includes('video');
}
export const isClosing = q => (q?.onboarding_group || q?.group || q?.meta_json?.onboarding_group) === 'closing_reflection';
// Preserve App's existing five-audio-part rule independently of video slots.
export const audioAvailability = (context,mode) => mode==='append' && context?.audioPartCount>=5 ? '音声の語り足しは上限に達しています。本文の編集、または語り直しをご利用ください。' : '';
export function videoAvailability(context, mode) {
  if (mode === 'append' && context?.hasVideo) return 'この節目には動画が残っています。語り足しは音声で行えます。動画を置き換える場合は「語り直し」をお選びください。';
  if (!context?.hasVideo && context?.videoCount >= 2) return 'すでに動画が2本保存されています。既存の動画を保持するため、今回は音声で残してください。';
  return '';
}

export function createMilestoneService(client, projectId, questionId, mode = 'initial') {
  const rpc = async (name, args) => {
    const {data,error} = await client.rpc(name,args);
    if(error) throw Error(error.code === '40001' ? '語りが更新されました。一覧から開き直してください。' : error.message || '保存できませんでした。');
    return data;
  };
  return {
    context: () => rpc('book_milestone_context',{p:projectId,q:questionId}),
    skip: () => rpc('book_milestone_skip',{p:projectId,q:questionId}),
    async process(part, context) {
      const ext = blob => blob.type.includes('mp4') ? 'mp4' : 'webm';
      part.reservation ||= await rpc('book_milestone_reserve',{p:projectId,q:questionId,mode,format:part.videoBlob?'video':'audio',audio_ext:ext(part.audioBlob),video_ext:part.videoBlob?ext(part.videoBlob):'mp4',expected:context.revision});
      const r=part.reservation;
      if (!part.audioUploaded) {
        const {error}=await client.storage.from('audio').upload(r.audio_path,part.audioBlob,{contentType:part.audioBlob.type,upsert:false});
        if(error && !['409','Duplicate'].includes(String(error.statusCode || error.error)))throw error;
        part.audioUploaded=true;
      }
      if(part.videoBlob && !part.videoUploaded){
        const {error}=await client.storage.from('videos').upload(r.video_path,part.videoBlob,{contentType:part.videoBlob.type,upsert:false});
        if(error && !['409','Duplicate'].includes(String(error.statusCode || error.error)))throw error;
        part.videoUploaded=true;
      }
      const common={bookProjectId:projectId,answerId:r.family_upload_id || r.answer_id,
        ...(r.family_upload_id?{familyUploadIds:[r.family_upload_id]}:{})};
      const {data,error}=await client.functions.invoke('transcribe-audio',{body:{...common,audioPaths:[r.audio_path],questionText:context.text}});
      if(error || !data?.success || !(data.transcript_raw || data.transcript))throw Error('文字起こしを取得できませんでした。録音を保ったまま再試行できます。');
      const fresh=data.transcript_raw || data.transcript;
      const transcript=mode==='append'?[context.textBody,fresh].filter(Boolean).join('\n\n'):fresh;
      const polished=await client.functions.invoke('polish-transcript',{body:{...common,questionText:context.text,transcriptRaw:transcript}});
      return {transcript,transcriptClean:polished.data?.transcript_clean || transcript,
        transcriptReadable:polished.data?.transcript_readable || transcript,transcriptEssay:polished.data?.transcript_essay || '',
        editedText:polished.data?.transcript_readable || transcript,selectedStyle:'readable',
        transcriptionStatus:'done',polishStatus:polished.error?'error':'done',duration:part.duration,
        audioUrl:part.audioUrl,videoUrl:part.videoUrl,editRecordingMode:mode};
    },
    save: (part,draft) => rpc('book_milestone_commit',{upload:part.reservation.id,draft:{...draft,audioUrl:undefined,videoUrl:undefined},duration:Math.round(part.duration),video_bytes:part.videoBlob?.size || 0,video_mime:part.videoBlob?.type || ''}),
  };
}
