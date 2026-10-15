// This adapter deliberately has no write transport and no customer credential.
// Components receive a snapshot, not the administrator's Supabase client.
export function createPreviewClient(snapshot, signMedia) {
  const denied = () => Promise.resolve({data:null,error:{code:'ADMIN_READ_ONLY',message:'閲覧専用です。変更は保存されません。'}});
  const ok = data => Promise.resolve({data,error:null});
  const tables = {
    book_cover_settings: snapshot.coverSettings ? [snapshot.coverSettings] : [],
    answers: snapshot.storyRows || [],
    media_assets: Object.values(snapshot.mediaByAnswerId || {}).flat().map(row=>({...row,book_project_id:snapshot.project.id})),
    user_questions: snapshot.rawQuestions || [],
  };
  const allowedPaths = new Map();
  for (const a of Object.values(snapshot.mediaByAnswerId || {}).flat()) {
    const bucket = a.asset_type === 'photo' ? 'photos' : a.asset_type === 'audio' ? 'audio' : null;
    if(bucket && a.storage_path)allowedPaths.set(`${bucket}/${a.storage_path}`, true);
  }
  for(const field of ['cover_photo_path','premium_cover_photo_path']) {
    if(snapshot.coverSettings?.[field])allowedPaths.set(`photos/${snapshot.coverSettings[field]}`,true);
  }
  for(const item of snapshot.videoStories||[])for(const field of ['video_storage_path','audio_storage_path','poster_storage_path'])if(item[field])allowedPaths.set(`videos/${item[field]}`,true);
  for(const item of snapshot.lifeOutline?.meta_json?.additional_audio||[])if(item.storage_path)allowedPaths.set(`audio/${item.storage_path}`,true);
  for(const memory of snapshot.approvedThemeMemories||[]){
    const r=memory.response||{};
    for(const p of [...(r.photo_paths||[]),...(r.answers||[]).map(a=>a.audioPath),r.extra_response?.audioPath].filter(Boolean))allowedPaths.set(`memory-contributions/${p}`,true);
  }
  function from(table) {
    if(!Object.hasOwn(tables,table))return new Proxy({}, {get:(_,key)=>key==='then'?denied().then.bind(denied()):()=>from(table)});
    let rows=tables[table],single=false,selected=false;
    const query={
      select(){selected=true;return query;},
      eq(key,value){rows=rows.filter(row=>row[key]===value);return query;},
      in(key,values){rows=rows.filter(row=>values.includes(row[key]));return query;},
      order(){return query;},limit(n){rows=rows.slice(0,n);return query;},
      maybeSingle(){single=true;return query;},single(){single=true;return query;},
      then(resolve,reject){return (selected?ok(single?rows[0]||null:rows):denied()).then(resolve,reject);},
      insert:denied,update:denied,upsert:denied,delete:denied,
    };
    return query;
  }
  return Object.freeze({
    adminReadOnly:true,
    from,
    rpc(name,args={}) {
      if(args.input_project_id && args.input_project_id!==snapshot.project.id)return denied();
      if(args.input_book_project_id && args.input_book_project_id!==snapshot.project.id)return denied();
      if(name==='get_book_work')return ok(snapshot.bookWork);
      if(name==='list_my_experience_contracts')return ok(snapshot.contracts || []);
      if(name==='list_owned_project_supporters')return ok(snapshot.supporters || []);
      if(name==='list_my_supporter_identities')return ok(snapshot.supporterIdentities || []);
      if(name==='list_owned_story_relationships')return ok(snapshot.relationships || []);
      return denied();
    },
    functions:Object.freeze({invoke:denied}),
    auth:Object.freeze({updateUser:denied,signOut:denied,signInWithOtp:denied}),
    storage:Object.freeze({from:bucket=>Object.freeze({
      createSignedUrl:(path,seconds)=>allowedPaths.has(`${bucket}/${path}`)?signMedia(bucket,path,Math.min(seconds||1800,1800)):denied(),
      upload:denied,update:denied,remove:denied,move:denied,copy:denied,
    })}),
  });
}
