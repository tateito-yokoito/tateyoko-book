// TEST-only: verify published Storage copies and text remain immutable when
// the synthetic work's living answer and source media references change.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

const ref='zpswxefgfabzvxdbtyvq';
const project='38915ab4-98a1-4055-9a23-7a812a8ff963';
const answer='4b332f6d-fee3-46c1-bc21-a34a8a304461';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
assert.ok(service&&anon);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const hash=value=>createHash('sha256').update(value).digest('hex');
const get=async(query)=>{const {data,error}=await query;assert.ifError(error);return data;};
const publication=await get(admin.from('voice_publications').select('id,public_id,status').eq('book_project_id',project).eq('status','published').single());
const item=await get(admin.from('voice_publication_items').select('*').eq('publication_id',publication.id).single());
assert.equal(item.audio_assets.length,2);assert.equal(item.photo_assets.length,1);
const metadata=async()=>{
 const response=await fetch(`${url}/functions/v1/public-voice`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({publicId:publication.public_id})});
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.success,true);
 return result.publication;
};
const originalMetadata=await metadata();
assert.equal(originalMetadata.items[0].audio.length,2);assert.equal(originalMetadata.items[0].photos.length,1);
const frozenAssets=[...item.audio_assets.map(row=>({bucket:'audio',path:row.storagePath})),...item.photo_assets.map(row=>({bucket:'photos',path:row.storagePath}))];
const frozenHashes=[];
for(const asset of frozenAssets){
 const {data,error}=await admin.storage.from(asset.bucket).download(asset.path);
 assert.ifError(error);frozenHashes.push(hash(Buffer.from(await data.arrayBuffer())));
}
assert.equal(frozenHashes[0],hash(fs.readFileSync('public/site/hp-renewal/sample-voice.wav')));
assert.equal(frozenHashes[1],hash(fs.readFileSync('public/site/trial-demo-voice.wav')));
assert.equal(frozenHashes[2],hash(fs.readFileSync('public/site/hero-book.jpg')));

// The source now points to different, valid TEST-only files; do not alter any
// completed copies. This intentionally leaves the QA source in a new state.
const root=`${account.id}/qa-web-book-media-20260924`;
const altAudio=`${root}/later-audio.wav`;
const altPhoto=`${root}/later-photo.jpg`;
assert.ifError((await admin.storage.from('audio').upload(altAudio,fs.readFileSync('public/site/trial-demo-voice.wav'),{contentType:'audio/wav',upsert:false})).error);
assert.ifError((await admin.storage.from('photos').upload(altPhoto,fs.readFileSync('public/site/book-spread.jpg'),{contentType:'image/jpeg',upsert:false})).error);
assert.ifError((await admin.from('answers').update({transcript_edited:'完成後に変更したQA専用の文章です。'}).eq('id',answer)).error);
assert.ifError((await admin.from('media_assets').update({storage_path:altAudio}).eq('id','ed2b0838-9a73-460c-a7fe-f87dc40db0c3')).error);
assert.ifError((await admin.from('media_assets').update({storage_path:altPhoto}).eq('id','8d9ca6db-fcf3-49c4-a829-0f947c7c45a7')).error);

const afterMetadata=await metadata();
assert.deepEqual(afterMetadata,originalMetadata);
const afterItem=await get(admin.from('voice_publication_items').select('*').eq('id',item.id).single());
assert.deepEqual(afterItem,item);
for(let n=0;n<frozenAssets.length;n++){
 const {data,error}=await admin.storage.from(frozenAssets[n].bucket).download(frozenAssets[n].path);
 assert.ifError(error);assert.equal(hash(Buffer.from(await data.arrayBuffer())),frozenHashes[n]);
}
const living=await get(admin.from('answers').select('transcript_edited').eq('id',answer).single());
assert.notEqual(living.transcript_edited,item.transcript_text);
console.log(JSON.stringify({testOnly:true,completedTextFrozen:true,completedAudioPartsFrozen:2,completedPhotoFrozen:true,
 originalPublicId:publication.public_id,publicMetadataUnchanged:true,storedCopiesByteIdentical:true,sourceChanged:true,productionChanged:false}));
