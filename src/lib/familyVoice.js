// Data adapter only. The question, recorder and review remain App's components.
export function familyQuestion(question) {
  return {
    ...question,
    user_question_id: question.id,
    content: question.text,
    onboarding_group: question.group,
    chapter_label: question.chapter,
    status: question.answered ? 'answered' : question.skipped ? 'skipped' : 'pending',
  };
}

export function createFamilyVoiceService(client, api, projectId) {
  const invoke = async (name, body) => {
    const {data,error} = await client.functions.invoke(name,{body});
    if (error || data?.success !== true) throw Error('音声の処理を完了できませんでした。');
    return data;
  };
  return {
    async process(parts, questionText, edit=null) {
      // Retain each reservation on retry, including when transcription fails.
      for (const part of parts) part.upload ||= await api.reserve(projectId,part.audioBlob,'audio');
      const familyUploadIds=parts.map(part=>part.upload.id);
      const common={answerId:familyUploadIds[0],bookProjectId:projectId,familyUploadIds,questionText};
      const transcription=await invoke('transcribe-audio',{
        ...common,audioPaths:parts.map(part=>part.upload.path),previousTranscript:'',fallbackTranscript:'',
      });
      const fresh=String(transcription.transcript_raw || transcription.transcript || '').trim();
      if (!fresh) throw Error('文字起こしを取得できませんでした。');
      const transcript=edit?.mode==='append' ? [edit.baseText,fresh].filter(Boolean).join('\n\n') : fresh;
      try {
        const polished=await invoke('polish-transcript',{...common,transcriptRaw:transcript});
        return {transcript,transcriptClean:polished.transcript_clean || transcript,
          transcriptReadable:polished.transcript_readable || transcript,
          transcriptEssay:polished.transcript_essay || '',polishStatus:'done'};
      } catch {
        // The established review can use the actual transcript if polish fails.
        return {transcript,transcriptClean:transcript,transcriptReadable:transcript,
          transcriptEssay:'',polishStatus:'error'};
      }
    },
    async save(parts, questionId, data, continuation=null, photo=null, edit=null) {
      if (!parts.length || parts.some(part=>!part.upload?.id)) throw Error('音声を保存できませんでした。');
      if (photo && continuation) throw Error('写真の語りの保存先を確認してください。');
      if (edit && (photo || continuation || edit.questionId!==questionId)) throw Error('語りの保存先を確認してください。');
      if (photo) photo.upload ||= await api.reserve(projectId,photo.file,'photo');
      const {data:answerId,error}=await client.rpc(edit ? 'family_revise_voice' : photo ? 'family_commit_photo_voice' : 'family_commit_voice',{
        uploads:parts.map(part=>part.upload.id),
        ...(edit ? {p:projectId,target:edit.answerId,mode:edit.mode,expected_revision:edit.revision} : {question_uuid:questionId,...(photo ? {photo_upload:photo.upload.id} : {continuation})}),
        draft:{transcript:data.transcript,transcriptClean:data.transcriptClean,
          transcriptReadable:data.transcriptReadable,transcriptEssay:data.transcriptEssay,
          editedText:data.editedText,selectedStyle:data.selectedStyle,duration:Math.round(data.duration || 0),
          ...(photo ? {photoStoryTitle:data.photoStoryTitle,photoStoryTitleSource:data.photoStoryTitleSource,photoStoryCaption:data.photoStoryCaption} : {})},
      });
      if (error || !answerId) throw Error(error?.code==='40001' ? '別の操作で語りが更新されました。一覧から開き直してください。' : '語りを保存できませんでした。もう一度お試しください。');
      return answerId;
    },
  };
}
