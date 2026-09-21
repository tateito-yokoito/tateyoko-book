// Shared source for paper preview, production rendering, and Web Book publication.
export async function loadBookWork(client, projectId) {
  const {data:work,error}=await client.rpc('get_book_work',{input_project_id:projectId});
  if(error)throw error;
  let answers,media;
  if(work.confirmed_at) {
    answers=work.snapshot.answers;
    media=work.snapshot.media;
    // After publication use the same immutable asset copies as the Web Book.
    const copies=new Map();
    for(const item of work.publication?.items||[]) {
      for(const asset of [...(item.audio_assets||[]),...(item.photo_assets||[])])
        copies.set(asset.sourceMediaId,asset.storagePath);
    }
    media=media.map(m=>({...m,storage_path:copies.get(m.id)||m.storage_path}));
  } else {
    const result=await client.from('answers').select('*').eq('book_project_id',projectId).order('sequence_order');
    if(result.error)throw result.error;
    answers=result.data||[];
    const resultMedia=await client.from('media_assets').select('*').eq('book_project_id',projectId).order('created_at');
    if(resultMedia.error)throw resultMedia.error;
    const ids=new Set(answers.map(a=>a.id));
    media=(resultMedia.data||[]).filter(m=>ids.has(m.answer_id));
  }
  const grouped={};
  for(const m of media) {
    if(!['photo','audio'].includes(m.asset_type))continue;
    const bucket=m.asset_type==='photo'?'photos':'audio';
    const {data,error}=await client.storage.from(bucket).createSignedUrl(m.storage_path,3600);
    if(error)throw error;
    (grouped[m.answer_id]||=[]).push({...m,url:data?.signedUrl});
  }
  return {work,answers,mediaByAnswerId:grouped};
}
