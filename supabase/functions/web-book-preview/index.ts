import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {requireFamilyRelease} from '../_shared/family-release.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({success:false},405);
 try {
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply({success:false},401);
  const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const caller=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:user,error:authError}=await caller.auth.getUser();
  if(authError||!user.user)return reply({success:false},401);
  const {projectId}=await req.json();
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(projectId||''))return reply({success:false},400);
  // Caller-scoped RPC explicitly checks operator or creator authorization and family gates.
  // Never accept client-provided snapshots or paths for signing.
  const {data,error}=await caller.rpc('get_web_book_preview',{input_project_id:projectId});
  if(error||!data?.snapshot||data.adminPreview!==true)return reply({success:false,error:'Preview unavailable'},403);
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  if(data.adminPreview!==true)await requireFamilyRelease(admin,projectId,user.user.id);
  const snapshot=data.snapshot;
  // Prefer immutable publication copies when this confirmed work has been prepared.
  if(data.workId) {
    const {data:publication}=await admin.from('voice_publications').select('id,snapshot_metadata,video_assets').eq('book_project_id',projectId).eq('work_manifest_id',data.workId).maybeSingle();
    if(publication) {
      const {data:items,error}=await admin.from('voice_publication_items').select('audio_assets,photo_assets').eq('publication_id',publication.id);
      if(error)return reply({success:false},503);
      const copies=new Map((items||[]).flatMap((i:any)=>[...(i.audio_assets||[]),...(i.photo_assets||[])]).map((a:any)=>[a.sourceMediaId,a.storagePath]));
      for(const group of [snapshot,snapshot.web_intro])if(group?.media)group.media=group.media.map((m:any)=>({...m,storage_path:copies.get(m.id)||m.storage_path}));
      if(publication.snapshot_metadata?.cover)snapshot.cover=publication.snapshot_metadata.cover;
      snapshot.videos=(snapshot.videos||[]).map((v:any)=>({...v,video_storage_path:(publication.video_assets||[]).find((a:any)=>a.sourceAnswerId===v.source_answer_id || a.slotOrder===v.slot_order)?.videoStoragePath||v.video_storage_path}));
    }
  }
  const sign=async(bucket:string,path:string)=>{
    if(!path)return null;
    // Customer previews retain Storage RLS, including cross-person path protection.
    // Only an independently verified admin RPC result enables operator signing.
    const signer=data.adminPreview===true?admin:caller;
    const {data:signed,error}=await signer.storage.from(bucket).createSignedUrl(path,900);
    if(error||!signed?.signedUrl)return null;
    return signed.signedUrl;
  };
  snapshot.cover={...snapshot.cover,url:await sign('photos',snapshot.cover?.cover_photo_path)};
  snapshot.media=await Promise.all((snapshot.media||[]).map(async(m:any)=>({...m,url:['photo','audio'].includes(m.asset_type)?await sign(m.asset_type==='photo'?'photos':'audio',m.storage_path):null})));
  if(snapshot.web_intro)snapshot.web_intro.media=await Promise.all((snapshot.web_intro.media||[]).map(async(m:any)=>({...m,url:['photo','audio'].includes(m.asset_type)?await sign(m.asset_type==='photo'?'photos':'audio',m.storage_path):null})));
  snapshot.videos=await Promise.all((snapshot.videos||[]).map(async(v:any)=>({...v,url:await sign('videos',v.video_storage_path)})));
  return reply({success:true,snapshot,hasUnpublishedChanges:data.hasUnpublishedChanges});
 }catch{return reply({success:false,error:'Preview unavailable'},503);}
});
