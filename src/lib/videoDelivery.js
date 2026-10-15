// Implementation limits, not a shorter customer recording allowance.
export const VIDEO_DELIVERY = Object.freeze({
  maxSeconds: 300, maxBytes: 48 * 1024 * 1024, bucketBytes: 50 * 1024 * 1024,
  videoBitsPerSecond: 800000, audioBitsPerSecond: 64000,
  width: 1280, height: 720, frameRate: 24,
});

export function validateVideoDelivery(blob, seconds) {
  if (!blob?.size || !Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw Error('動画は5分以内で録画してください。');
  if (blob.size > VIDEO_DELIVERY.maxBytes) throw Error('動画の容量を調整できませんでした。元の録画はこの端末に保存されています。');
  if (!/^video\/(mp4|webm)(;|$)/.test(blob.type)) throw Error('この動画形式は保存できません。');
}

function openDrafts() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('tateyoko-video-drafts',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function videoDraft(action, userId, projectId, value) {
  if (!userId || !projectId) throw Error('動画の保存先を確認できません。');
  const db=await openDrafts(),key=`${userId}:${projectId}`;
  try {return await new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',action==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');
    const request=action==='get'?store.get(key):action==='delete'?store.delete(key):store.put({...value,key});
    let result;request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });} finally {db.close();}
}

// Retry retains the same immutable paths. Successful objects are verified, never overwritten.
export async function deliverVideoDraft(client, draft, upload, checkpoint) {
  const {row, files}=draft;
  const {data:existing,error:readError}=await client.from('video_stories').select('id,video_storage_path').eq('id',row.id).maybeSingle();
  if(readError)throw readError;
  if(existing && existing.video_storage_path!==row.video_storage_path)throw Error('動画の保存先が一致しません。');
  if(!existing) {
    const {error}=await client.from('video_stories').insert({...row,status:'processing',metadata:{...row.metadata,upload_complete:false}});
    if(error)throw error;
  }
  for(const file of files) {
    // An acknowledged upload can survive a lost response/reload. Compare complete bytes
    // before skipping; presence alone could accept a wrong/incomplete object.
    const {data:remote}=await client.storage.from('videos').download(file.path);
    if(remote) {
      const digest=async blob=>new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
      const a=await digest(remote),b=await digest(file.blob);
      if(remote.size!==file.blob.size||!a.every((v,i)=>v===b[i]))throw Error('保存済み動画が一致しません。上書きせず確認が必要です。');
    } else await upload(file);
    draft.completed=[...new Set([...(draft.completed||[]),file.path])];await checkpoint(draft);
  }
  const {data:completedRow,error}=await client.from('video_stories').update({
    status:'ready',metadata:{...row.metadata,upload_complete:true,transcription_status:'pending'},
  }).eq('id',row.id).select('id,status,metadata').single();
  if(error)throw error;
  if(completedRow?.id!==row.id || completedRow.status!=='ready' || completedRow.metadata?.upload_complete!==true)throw Error('動画の保存完了を確認できません。録画を残して再試行できます。');
  return row.id;
}

// Oversized recordings are re-encoded locally, at full duration, without uploading
// a huge source or making a serverless worker transcode it. Must run foreground.
export async function compressVideo(blob, onProgress=()=>{}) {
  if(blob.size<=VIDEO_DELIVERY.maxBytes)return blob;
  const source=document.createElement('video'),canvas=document.createElement('canvas');
  // Audio is routed only into the output stream, not speakers. Muting this
  // element also silences the MediaElementSource used for the saved video.
  source.playsInline=true;source.muted=false;source.src=URL.createObjectURL(blob);
  let stream,recorder,frame,context,audioContext;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('動画の読み込みに時間がかかっています。元の録画を残して再試行できます。')),30000);
      source.onloadedmetadata=()=>{clearTimeout(timer);resolve();};
      source.onerror=()=>{clearTimeout(timer);reject(Error('動画を読み込めません。元の録画は残っています。'));};
    });
    const scale=Math.min(1,854/source.videoWidth,480/source.videoHeight);
    canvas.width=Math.max(2,Math.round(source.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.round(source.videoHeight*scale/2)*2);
    context=canvas.getContext('2d');stream=canvas.captureStream(24);
    audioContext=new AudioContext();await audioContext.resume();
    const audio=audioContext.createMediaElementSource(source),destination=audioContext.createMediaStreamDestination();
    audio.connect(destination);destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw Error('この端末では動画を圧縮できません。');
    const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:600000,audioBitsPerSecond:64000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    let rejectComplete;
    const complete=new Promise((resolve,reject)=>{rejectComplete=reject;recorder.onstop=resolve;recorder.onerror=reject;source.onerror=reject;});
    const draw=()=>{context.drawImage(source,0,0,canvas.width,canvas.height);onProgress(source.currentTime/source.duration);frame=requestAnimationFrame(draw);};
    const hidden=()=>{if(document.hidden){source.pause();if(recorder.state==='recording')recorder.pause();}else if(recorder.state==='paused'){recorder.resume();source.play().catch(()=>rejectComplete(Error('動画の処理を再開できませんでした。元の録画を残して再試行できます。')));}};
    document.addEventListener('visibilitychange',hidden);
    try {
      recorder.start(1000);await source.play();draw();
      source.onended=()=>{if(recorder.state!=='inactive')recorder.stop();};
      await complete;
      const result=new Blob(chunks,{type:recorder.mimeType});
      if(!result.size||result.size>VIDEO_DELIVERY.maxBytes)throw Error('動画の容量を調整できませんでした。元の録画は残っています。');
      return result;
    }finally{document.removeEventListener('visibilitychange',hidden);}
  }finally{
    cancelAnimationFrame(frame);if(recorder&&recorder.state!=='inactive')recorder.stop();
    stream?.getTracks().forEach(t=>t.stop());source.pause();URL.revokeObjectURL(source.src);await audioContext?.close();
  }
}
