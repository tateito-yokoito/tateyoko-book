// Remote TEST acceptance. Uses only QA Auth and existing TEST data.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const ref = 'zpswxefgfabzvxdbtyvq';
const file = process.env.QA_ADMIN_ACCOUNT_FILE;
const cli = process.env.QA_SUPABASE_CLI;
assert.ok(file && cli);
const account = JSON.parse(readFileSync(file, 'utf8'));
assert.equal(account.ref, ref);
const raw = execFileSync(cli, ['projects','api-keys','--project-ref',ref,'--output','json'], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const keys = JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon = keys.find(item => item.name==='anon' && item.type==='legacy')?.api_key;
const service = keys.find(item => item.name==='service_role' && item.type==='legacy')?.api_key;
assert.ok(anon && service);
const url = `https://${ref}.supabase.co`;
const admin = createClient(url,anon,{auth:{persistSession:false}});
const privileged = createClient(url,service,{auth:{persistSession:false}});
const login = await admin.auth.signInWithPassword({email:account.email,password:account.password});
assert.ok(!login.error && login.data.session);
const checks = {};
const counts = async () => {
  // Compare only non-content operational metadata; never fetch story text or media paths.
  const columns={book_projects:'id,status,updated_at',answers:'id',media_assets:'id',
    voice_publications:'id,status,updated_at',commerce_orders:'id,status,updated_at'};
  return Object.fromEntries(await Promise.all(Object.entries(columns).map(async ([table,projection])=>{
    const rows=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await privileged.from(table).select(projection).order('id').range(offset,offset+499);
      assert.ok(!error,error?.message);rows.push(...data);
      if(data.length<500)break;
    }
    return [table,{count:rows.length,metadataHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];
  })));
};
const before = await counts();
const own = await admin.rpc('get_admin_readonly_customer',{input_account_id:account.id});
assert.ok(!own.error && own.data?.actor_id===account.id && own.data.capability==='read');
assert.equal(own.data.bookshelf.some(item=>item.status==='draft'),false);
checks.adminOwnHome = true;
const supporters = await privileged.from('project_supporters').select('supporter_user_id,book_project_id,status,can_edit_book_text,can_build_book').eq('status','active');
assert.ok(!supporters.error);
let readable=null,supported=null;
for(const row of supporters.data.filter(item=>item.can_edit_book_text||item.can_build_book)){
  const response=await admin.rpc('get_admin_readonly_customer',{input_account_id:row.supporter_user_id});
  if(!response.error && response.data.supported_projects.some(p=>p.id===row.book_project_id)){
    readable=row;supported=response;break;
  }
}
let viewer=null;
const recipients=await privileged.from('story_share_recipients').select('recipient_user_id,sharing_preference_id,status').eq('status','active');
assert.ok(!recipients.error);
for(const recipient of recipients.data){
  const preference=await privileged.from('story_sharing_preferences').select('book_project_id').eq('id',recipient.sharing_preference_id).single();
  if(preference.error)continue;
  const response=await admin.rpc('get_admin_readonly_customer_stories',{input_account_id:recipient.recipient_user_id,input_project_id:preference.data.book_project_id});
  if(response.error){viewer={supporter_user_id:recipient.recipient_user_id,book_project_id:preference.data.book_project_id};break;}
}
assert.ok(readable && viewer);
assert.ok(!supported.error && supported.data.supported_projects.some(p=>p.id===readable.book_project_id));
const stories = await admin.rpc('get_admin_readonly_customer_stories',{input_account_id:readable.supporter_user_id,input_project_id:readable.book_project_id});
assert.ok(!stories.error && Array.isArray(stories.data?.answers));
checks.supporterWithoutOwnStory = supported.data.owned_projects.length===0;
checks.supporterStoryRead = true;
// Revoke only inside a rolled-back TEST transaction. The target has no own
// story, so this isolates the supporter capability from owner permissions.
const revokeSql = `begin; select set_config('request.jwt.claim.sub','${account.id}',true);
  update public.project_supporters set status='revoked' where supporter_user_id='${readable.supporter_user_id}' and book_project_id='${readable.book_project_id}';
  do $$begin
    begin
      perform public.get_admin_readonly_customer_stories('${readable.supporter_user_id}'::uuid,'${readable.book_project_id}'::uuid);
      raise exception 'Revoked supporter unexpectedly retained story access';
    exception when insufficient_privilege then null;
    end;
  end $$;
  rollback;`;
const revokeRaw=execFileSync(cli,['db','query','--linked','--project-ref',ref,revokeSql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
assert.ok(!JSON.parse(revokeRaw.slice(revokeRaw.indexOf('{'))).error);
checks.revokedSupporterDenied = true;
const viewerRead = await admin.rpc('get_admin_readonly_customer_stories',{input_account_id:viewer.supporter_user_id,input_project_id:viewer.book_project_id});
assert.ok(viewerRead.error);
checks.viewerDenied = true;
const supportedEdge=await admin.functions.invoke('admin-web-book-preview',{
  body:{action:'stories',targetAccountId:readable.supporter_user_id,projectId:readable.book_project_id},
});
assert.ok(!supportedEdge.error && supportedEdge.data?.success && Array.isArray(supportedEdge.data.stories?.answers));
const viewerEdge=await admin.functions.invoke('admin-web-book-preview',{
  body:{action:'stories',targetAccountId:viewer.supporter_user_id,projectId:viewer.book_project_id},
});
assert.ok(viewerEdge.error || viewerEdge.data?.success!==true);
checks.storyEdgeTargetScope = true;
const unrelated = await privileged.from('book_projects').select('id').neq('id',readable.book_project_id).limit(20);
assert.ok(!unrelated.error);
let otherDenied=false;
for(const item of unrelated.data){
  const response=await admin.rpc('get_admin_readonly_customer_stories',{input_account_id:readable.supporter_user_id,input_project_id:item.id});
  if(response.error){otherDenied=true;break;}
}
assert.ok(otherDenied);
checks.otherProjectDenied = true;
const guest = createClient(url,anon,{auth:{persistSession:false}});
assert.ok((await guest.rpc('get_admin_readonly_customer',{input_account_id:account.id})).error);
checks.unauthenticatedDenied = true;
const media = await privileged.from('media_assets').select('book_project_id,storage_path,asset_type').in('asset_type',['audio','photo']).not('storage_path','is',null).limit(100);
assert.ok(!media.error && media.data.length>1);
const asset = media.data.find(row=>media.data.some(other=>other.book_project_id!==row.book_project_id));
const otherProject = media.data.find(row=>row.book_project_id!==asset.book_project_id);
const bucket = asset.asset_type==='photo'?'photos':'audio';
const good = await privileged.rpc('admin_readonly_preview_asset',{input_project_id:asset.book_project_id,input_bucket:bucket,input_path:asset.storage_path});
const bad = await privileged.rpc('admin_readonly_preview_asset',{input_project_id:otherProject.book_project_id,input_bucket:bucket,input_path:asset.storage_path});
assert.ok(!good.error && !bad.error && bad.data===false);
checks.crossProjectAssetDenied = true;
checks.existingAsset = good.data===true;
const drafts = await privileged.from('book_projects').select('id').limit(84);
assert.ok(!drafts.error);
let preview = null;
for(const p of drafts.data){
  const publication=await privileged.from('voice_publications').select('id').eq('book_project_id',p.id).in('status',['published','disabled']).limit(1);
  if(publication.data?.length)continue;
  const response=await admin.functions.invoke('admin-web-book-preview',{body:{projectId:p.id}});
  if(!response.error&&response.data?.success){preview=p.id;break;}
}
checks.livePreview = Boolean(preview);
assert.ok(preview,'No TEST draft could be previewed with validated Storage material');
const blocked = await guest.functions.invoke('admin-web-book-preview',{body:{projectId:preview}});
assert.ok(blocked.error || blocked.data?.success!==true);
checks.previewGuestDenied = true;
const after = await counts();
assert.deepEqual(after,before);
checks.customerOrderPublicationUnchanged = true;
// Compare every non-admin TEST account's projected shelf with the currently
// deployed customer list_voice_library() under that same account claim.
const shelfSql=`begin;
do $$declare target uuid; actual uuid[]; projected uuid[]; begin
  for target in select id from auth.users u where not exists(select 1 from public.admin_users a where a.user_id=u.id and a.is_active) loop
    perform set_config('request.jwt.claim.sub',target::text,true);
    select array_agg(publication_id order by publication_id) into actual from public.list_voice_library();
    perform set_config('request.jwt.claim.sub','${account.id}',true);
    select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) into projected
      from jsonb_array_elements(public.get_admin_readonly_customer(target)->'bookshelf') x;
    if coalesce(actual,'{}'::uuid[])<>coalesce(projected,'{}'::uuid[]) then
      raise exception 'Customer bookshelf projection mismatch';
    end if;
  end loop;
end $$;
rollback;`;
const shelfRaw=execFileSync(cli,['db','query','--linked','--project-ref',ref,shelfSql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
assert.ok(!JSON.parse(shelfRaw.slice(shelfRaw.indexOf('{'))).error);
checks.bookshelfMatchesCustomerFunction = true;
console.log(JSON.stringify({testOnly:true,productionChanged:false,checks}));
