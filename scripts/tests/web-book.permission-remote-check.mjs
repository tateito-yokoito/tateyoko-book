// TEST-only remote permission regression for admin customer projections.
// All temporary QA grants/shares are restored in finally.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq';
const actorId='f6a3009c-d0ee-4872-8823-a931545b2a5a';
const ownerId='6809d5cd-22da-4e40-a82a-75016849a7fa';
const supporterId='e11ddc29-e4d1-4b2b-9125-3eba92d23d0b';
const project='c3f1b8ec-3a16-49ca-b816-9660b835c493';
const unrelated='38915ab4-98a1-4055-9a23-7a812a8ff963';
const publication='6dd1e0ec-f017-46a9-81d4-e0df7cb2be1b';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);assert.equal(account.id,actorId);
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(anon&&service);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const actor=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
let preferenceId=null,recipientId=null,paused=false,granted=false;
const ok=async promise=>{const result=await promise;assert.ifError(result.error);return result.data;};
try{
 const auth=await ok(actor.auth.signInWithPassword({email:account.email,password:account.password}));
 assert.equal(auth.user.id,actorId);
 await ok(admin.from('admin_users').upsert({user_id:actorId,role:'viewer',is_active:true}));granted=true;
 const before=await ok(actor.rpc('get_admin_customer_experience',{input_account_id:supporterId}));
 assert.ok(before.supported_projects.some(row=>row.book_project_id===project));
 assert.equal(await ok(actor.rpc('admin_customer_can_read_publication',{input_account_id:supporterId,input_publication_id:publication})),true);
 const pref=await ok(admin.from('story_sharing_preferences').insert({book_project_id:project,selected_sharing_enabled:true,family_sharing_enabled:false}).select('id').single());
 preferenceId=pref.id;
 const recipient=await ok(admin.from('story_share_recipients').insert({sharing_preference_id:preferenceId,recipient_user_id:actorId,status:'active',recipient_phase:'live',source:'selected'}).select('id').single());
 recipientId=recipient.id;
 const viewer=await ok(actor.rpc('get_admin_customer_experience',{input_account_id:actorId}));
 assert.ok(viewer.bookshelf.some(row=>row.publication_id===publication));
 assert.equal(viewer.supported_projects.some(row=>row.book_project_id===project),false);
 const viewerStories=await actor.rpc('get_admin_customer_project_stories',{input_account_id:actorId,input_project_id:project});
 assert.ok(viewerStories.error,'Viewer must not see production stories');
 assert.equal(await ok(actor.rpc('admin_customer_can_read_publication',{input_account_id:actorId,input_publication_id:publication})),true);
 const unrelatedStories=await actor.rpc('get_admin_customer_project_stories',{input_account_id:supporterId,input_project_id:unrelated});
 assert.ok(unrelatedStories.error,'Supporter must not see an unrelated Project');
 await ok(admin.from('project_supporters').update({status:'revoked'}).eq('id','e5da2211-9019-4fe1-a0a5-7d879c5daa5b'));paused=true;
 const revoked=await ok(actor.rpc('get_admin_customer_experience',{input_account_id:supporterId}));
 assert.equal(revoked.supported_projects.some(row=>row.book_project_id===project),false);
 assert.equal(revoked.bookshelf.some(row=>row.publication_id===publication),false);
 const revokedStories=await actor.rpc('get_admin_customer_project_stories',{input_account_id:supporterId,input_project_id:project});
 assert.ok(revokedStories.error,'Revoked supporter must not see production stories');
 assert.equal(await ok(actor.rpc('admin_customer_can_read_publication',{input_account_id:supporterId,input_publication_id:publication})),false);
 console.log(JSON.stringify({testOnly:true,viewerCompletedBookOnly:true,viewerProductionStoriesDenied:true,unrelatedProjectDenied:true,revokedSupporterHomeDenied:true,revokedSupporterStoriesDenied:true,revokedSupporterWebBookReviewDenied:true,productionChanged:false}));
}finally{
 if(paused)await ok(admin.from('project_supporters').update({status:'active'}).eq('id','e5da2211-9019-4fe1-a0a5-7d879c5daa5b'));
 if(recipientId)await ok(admin.from('story_share_recipients').delete().eq('id',recipientId));
 if(preferenceId)await ok(admin.from('story_sharing_preferences').delete().eq('id',preferenceId));
 if(granted)await ok(admin.from('admin_users').delete().eq('user_id',actorId));
 await actor.auth.stopAutoRefresh();
}
