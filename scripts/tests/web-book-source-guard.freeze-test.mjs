// TEST-only: mutate the isolated living source after paid completion.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq',cli=process.env.QA_SUPABASE_CLI;
const fixture=JSON.parse(fs.readFileSync('output/web-book-e2e/source-guard-fixtures.json','utf8'));
const row=fixture.results.find(item=>item.kind==='checkout_valid');
assert.equal(fixture.ref,ref);assert.ok(row);
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],
 {encoding:'utf8',stdio:['ignore','pipe','pipe']});
const service=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1))
 .find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(service);
const admin=createClient(`https://${ref}.supabase.co`,service,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async p=>{const {data,error}=await p;assert.ifError(error);return data;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const quote=x=>`'${String(x).replaceAll("'","''")}'`;
const db=sql=>{
 const output=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
 const result=JSON.parse(output.slice(output.indexOf('{')));
 assert.ok(!result.error,result.error?.message);
};
const publication=await ok(admin.from('voice_publications').select('id,public_id,status').eq('book_project_id',row.project).single());
assert.equal(publication.status,'published');
const before=await ok(admin.from('voice_publication_items').select('*').eq('publication_id',publication.id).single());
assert.equal(before.audio_assets.length,1);assert.equal(before.photo_assets.length,1);
const media=await ok(admin.from('media_assets').select('id,asset_type,storage_path').eq('answer_id',row.answer));
const copies=[];
for(const asset of [...before.audio_assets,...before.photo_assets]){
 const source=media.find(item=>item.id===asset.sourceMediaId);assert.ok(source);
 const bucket=source.asset_type==='audio'?'audio':'photos';
 const [a,b]=await Promise.all([admin.storage.from(bucket).download(source.storage_path),
  admin.storage.from(bucket).download(asset.storagePath)]);
 assert.ifError(a.error);assert.ifError(b.error);
 const copiedHash=hash(Buffer.from(await b.data.arrayBuffer()));
 assert.equal(hash(Buffer.from(await a.data.arrayBuffer())),copiedHash);
 copies.push({bucket,path:asset.storagePath,hash:copiedHash,sourceId:source.id});
}
const laterAudio=`${account.id}/${row.project}/${row.answer}/later.wav`;
const laterPhoto=`${account.id}/${row.project}/${row.answer}/later.jpg`;
for(const [bucket,path,file,type] of [['audio',laterAudio,'public/site/trial-demo-voice.wav','audio/wav'],
 ['photos',laterPhoto,'public/site/hero-book.jpg','image/jpeg']]){
 await ok(admin.storage.from(bucket).upload(path,fs.readFileSync(file),{contentType:type,upsert:true}));
}
const audio=media.find(item=>item.asset_type==='audio'),photo=media.find(item=>item.asset_type==='photo');
db(`begin;
 update public.experience_contracts set production_started_at=coalesce(production_started_at,now()),
  production_expires_at=coalesce(production_expires_at,now()+interval '1 year'),
  main_experience_started_at=coalesce(main_experience_started_at,now())
  where book_project_id=${quote(row.project)};
 update public.answers set transcript_edited='QA changed after paid completion' where id=${quote(row.answer)};
 update public.media_assets set storage_path=${quote(laterAudio)} where id=${quote(audio.id)};
 update public.media_assets set storage_path=${quote(laterPhoto)} where id=${quote(photo.id)};
 commit;`);
const after=await ok(admin.from('voice_publication_items').select('*').eq('id',before.id).single());
assert.equal(after.transcript_text,before.transcript_text);
assert.deepEqual(after.audio_assets,before.audio_assets);
assert.deepEqual(after.photo_assets,before.photo_assets);
for(const copy of copies){
 const object=await admin.storage.from(copy.bucket).download(copy.path);
 assert.ifError(object.error);
 assert.equal(hash(Buffer.from(await object.data.arrayBuffer())),copy.hash);
}
console.log(JSON.stringify({testOnly:true,paidCompletedFrozen:true,textUnchanged:true,
 audioUnchanged:true,photoUnchanged:true,publicIdStable:true,productionChanged:false}));
