import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireFamilyProjectAccess } from "../_shared/family-access.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
serve(async request => {
 if(request.method === "OPTIONS") return new Response("ok",{headers:cors});
 if(request.method !== "POST") return json({error:"Method not allowed"},405);
 try {
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  const {data:auth,error:authError}=await admin.auth.getUser(token);
  if(authError || !auth.user) return json({error:"ログインが必要です"},401);
  const {projectId}=await request.json();
  const familySubject=await requireFamilyProjectAccess(admin,projectId,auth.user.id,"export");
  const {data:project,error:projectError}=await admin.from("book_projects").select("id,owner_user_id,subject_person_id").eq("id",projectId).single();
  if(projectError || (!familySubject && project.owner_user_id !== auth.user.id)) return json({error:"本人の記録のみ取得できます"},403);
  const {data:allowed,error:accessError}=await admin.rpc("experience_data_allowed",{input_project_id:projectId,input_write:false});
  if(accessError || !allowed) return json({error:"データ取得期間が終了しています。運営にご相談ください。"},403);
  const {data:contracts,error:contractError}=await admin.from("experience_contracts").select("order_id,refund_confirmed_at,export_available_until")
    .eq("book_project_id",projectId).not("payment_confirmed_at","is",null)
    .order("refund_confirmed_at",{ascending:false,nullsFirst:true}).order("created_at",{ascending:false}).limit(1);
  if(contractError) throw contractError;
  let deadline=contracts?.[0]?.export_available_until;
  if (deadline) {
    const {data:r,error} = await admin.from("experience_refund_requests").select("status").eq("order_id",contracts[0].order_id).single();
    if(error) throw error;
    if(r.status === "failed") deadline=null; // Bank failure is retained for review, not scheduled for expiry/deletion.
  }
  // Re-authorize on each export. Signed original files expire within 60s and never after the grace deadline.
  const ttl=deadline ? Math.min(60,Math.floor((new Date(deadline).getTime()-Date.now())/1000)) : 60;
  if(ttl<1) return json({error:"取得期限を過ぎています。運営にご相談ください。"},403);
  const rows=async(table:string)=>{
    const all:any[]=[];
    for(let offset=0;offset<10000;offset+=500){
      const {data,error}=await admin.from(table).select("*").eq("book_project_id",projectId).order("id").range(offset,offset+499);
      if(error) throw error;
      all.push(...data);
      if(data.length<500) return all;
    }
    throw new Error("Export needs operator assistance"); // Never silently truncate a person's records.
  };
  const [answers,media,videos,introductions]=await Promise.all([rows("answers"),rows("media_assets"),rows("video_stories"),rows("project_introductions")]);
  const files:any[]=[];const seen=new Set<string>();
  const add=async(bucket:string,path:string,type:string)=>{
    if(!path || seen.has(`${bucket}/${path}`))return;
    seen.add(`${bucket}/${path}`);
    const filename=path.split("/").pop() || "recording";
    const {data,error}=await admin.storage.from(bucket).createSignedUrl(path,ttl,{download:filename});
    if(error || !data?.signedUrl) throw new Error("An original file could not be prepared");
    files.push({type,filename,url:data.signedUrl});
  };
  for(const m of media) if(["audio","photo"].includes(m.asset_type)) await add(m.asset_type==="audio"?"audio":"photos",m.storage_path,m.asset_type);
  for(const v of videos) for(const field of ["video_storage_path","audio_storage_path","poster_storage_path"]) await add("videos",v[field],field);
  for(const intro of introductions) for(const extra of (intro.meta_json?.additional_audio || [])) await add("audio",extra.storage_path,"introduction_audio");
  return json({success:true,projectId,expiresAt:new Date(Date.now()+ttl*1000).toISOString(),
    records:{schemaVersion:1,subjectPersonId:project.subject_person_id,answers,introductions,videos},files});
 }catch(_error){return json({error:"データを準備できませんでした。もう一度お試しください。"},500);}
});
