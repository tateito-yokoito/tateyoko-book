// Explicit payload only: never pass transcripts, errors, URLs or contact data.
export const JOURNEY_EVENTS = new Set(['link_access','auth_view','auth_success','question_view','recording_start','recording_end','save_start','save_complete','save_failed','mic_denied','mic_unavailable','recording_failed']);
export function createSupportJourney(client, {enabled=false, token=null, linkId=null, randomUUID=()=>crypto.randomUUID()}={}) {
  const journeyId=enabled?randomUUID():null;
  const seen=new Set();
  let count=0;
  return {
    emit(event, {projectId=null,questionId=null,once=false}={}) {
      if(!enabled||!JOURNEY_EVENTS.has(event)||count>=100)return;
      const key=JSON.stringify([event,projectId,questionId]);
      if(once&&seen.has(key))return;
      seen.add(key);count++;
      // Detached and bounded; telemetry must never block recording or saving.
      try {Promise.resolve(client.rpc('record_support_journey_event',{
        p_event_id:randomUUID(),p_journey_id:journeyId,p_event:event,
        p_project_id:projectId,p_question_id:questionId,p_token:token,p_link_id:linkId
      })).catch(()=>{});}catch{}
    }
  };
}

export const JOURNEY_LABELS={link_access:'リンクへのアクセス（自動アクセスの可能性あり）',auth_view:'ログイン画面を表示',auth_success:'ログインを確認',question_view:'問いを表示',recording_start:'録音を開始',recording_end:'録音を終了',save_start:'保存を開始',save_complete:'回答データの保存を確認',save_failed:'保存処理でエラー',mic_denied:'マイクの利用が許可されていない',mic_unavailable:'マイクを利用できない',recording_failed:'録音でエラー'};
