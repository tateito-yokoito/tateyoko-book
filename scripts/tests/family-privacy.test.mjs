import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFamilyPrivacyAccess} from '../../src/lib/familyPrivacy.js';

const workspace=()=>({project_id:'mother',role:'subject',questions:[{id:'q',sequence_order:9011}],
  answers:[{id:'daughter-recorded',question_id:'q',text:'母の言葉',private:true}]});
test('subject privacy includes daughter-recorded answers and maps question UUID, not actor sequence',async()=>{
 const access=createFamilyPrivacyAccess({workspace:async()=>workspace()},'mother');
 const rows=await access.list();
 assert.equal(rows[0].id,'daughter-recorded');assert.equal(rows[0].sequence_order,9011);
 assert.equal(rows[0].transcript_edited,'母の言葉');assert.equal(rows[0].access_override,'private_forever');
});
test('share/unshare uses subject RPC and reloads authoritative state',async()=>{
 const state=workspace(),calls=[];
 const access=createFamilyPrivacyAccess({workspace:async()=>state,share:async(id,share)=>{
  calls.push({id,share});state.answers[0].private=!share;
 }},'mother');
 assert.equal((await access.setPrivate('daughter-recorded',false))[0].access_override,'inherit');
 assert.equal((await access.setPrivate('daughter-recorded',true))[0].access_override,'private_forever');
 assert.deepEqual(calls,[{id:'daughter-recorded',share:true},{id:'daughter-recorded',share:false}]);
});
test('rejects supporter, different project, foreign answer, invalid visibility and refresh failure',async()=>{
 let calls=0,state=workspace();
 const api={workspace:async()=>state,share:async()=>{calls++;}};
 const access=createFamilyPrivacyAccess(api,'mother');
 state.role='supporter';await assert.rejects(()=>access.setPrivate('daughter-recorded',false));
 state=workspace();state.project_id='daughter';await assert.rejects(()=>access.list());
 state=workspace();await assert.rejects(()=>access.setPrivate('foreign',false));
 await assert.rejects(()=>access.setPrivate('daughter-recorded','false'));assert.equal(calls,0);
 let reads=0;
 const failed=createFamilyPrivacyAccess({...api,workspace:async()=>{if(++reads>1)throw Error('offline');return workspace();}},'mother');
 await assert.rejects(()=>failed.setPrivate('daughter-recorded',true),/offline/);
});
