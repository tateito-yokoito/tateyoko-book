import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFamilyVoiceService,familyQuestion} from '../../src/lib/familyVoice.js';

test('question adapts identity without changing prompt',()=>{
 const q=familyQuestion({id:'question-uuid',text:'幼い頃のこと',chapter:'幼い頃',group:'starting_conversation'});
 assert.equal(q.content,'幼い頃のこと');assert.equal(q.user_question_id,'question-uuid');assert.equal(q.onboarding_group,'starting_conversation');
});
test('retry retains uploads; transcript/styles/actor project reach atomic save',async()=>{
 let reserved=0,fail=true;const calls=[];
 const client={functions:{async invoke(name,{body}){calls.push({name,body});
  if(name==='transcribe-audio'){if(fail){fail=false;return{error:Error('offline')};}return{data:{success:true,transcript_raw:'本当に話した言葉'}};}
  return{data:{success:true,transcript_clean:'そのまま',transcript_readable:'語り調',transcript_essay:'作品調'}};
 }},async rpc(name,body){calls.push({name,body});return{data:'saved-answer'};}};
 const service=createFamilyVoiceService(client,{async reserve(){reserved++;return{id:'upload-'+reserved,path:'path-'+reserved};}},'mother-project');
 const parts=[{audioBlob:new Blob(['audio'])},{audioBlob:new Blob(['more'])}];
 await assert.rejects(()=>service.process(parts,'問い'));assert.equal(reserved,2);
 const draft=await service.process(parts,'問い');assert.equal(reserved,2);
 assert.equal(draft.transcript,'本当に話した言葉');assert.equal(draft.transcriptEssay,'作品調');
 await service.save(parts,'question-id',{...draft,editedText:'修正した言葉',selectedStyle:'essay',duration:42});
 const saved=calls.at(-1);assert.equal(saved.name,'family_commit_voice');assert.equal(saved.body.draft.editedText,'修正した言葉');
 assert.deepEqual(saved.body.uploads,['upload-1','upload-2']);
 for(const c of calls.filter(c=>c.name!=='family_commit_voice')){
  assert.equal(c.body.bookProjectId,'mother-project');assert.deepEqual(c.body.familyUploadIds,['upload-1','upload-2']);
  assert.equal(c.body.answerId,'upload-1');assert.equal('userId' in c.body,false);
 }
});
test('polish failure preserves real transcript, never fabricated content',async()=>{
 const service=createFamilyVoiceService({functions:{async invoke(name){return name==='transcribe-audio'?{data:{success:true,transcript_raw:'実際の声'}}:{error:Error('offline')};}}},{async reserve(){return{id:'u',path:'p'};}},'mother-project');
 const result=await service.process([{audioBlob:new Blob(['voice'])}],'問い');
 assert.equal(result.transcriptReadable,'実際の声');assert.equal(result.polishStatus,'error');
});
test('photo voice commits one photo and voice atomically; save retry retains reservation',async()=>{
 let reserved=0,fail=true;const calls=[];
 const service=createFamilyVoiceService({async rpc(name,body){calls.push({name,body});if(fail){fail=false;return{error:Error('offline')};}return{data:'photo-answer'};}},
 {async reserve(p,file,kind){assert.equal(kind,'photo');reserved++;return{id:'photo-upload'};}},'mother');
 const parts=[{upload:{id:'audio-upload'}}],photo={file:new Blob(['photo'],{type:'image/jpeg'})};
 const draft={transcript:'母の声',selectedStyle:'readable',photoStoryTitle:'写真の記憶'};
 await assert.rejects(()=>service.save(parts,'photo-question',draft,null,photo));
 assert.equal(await service.save(parts,'photo-question',draft,null,photo),'photo-answer');
 assert.equal(reserved,1);assert.deepEqual(calls[0],calls[1]);
 assert.equal(calls[0].name,'family_commit_photo_voice');assert.equal(calls[0].body.photo_upload,'photo-upload');
 assert.equal(calls[0].body.draft.photoStoryTitle,'写真の記憶');assert.equal('continuation' in calls[0].body,false);
});
