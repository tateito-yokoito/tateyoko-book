import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFamilySharedStories} from '../../src/lib/familySharedStories.js';

const fixture = () => ({project_id:'mother',role:'supporter',name:'母',
  questions:[{id:'q1',text:'最初の問い'},{id:'q2',text:'次の問い'}],
  answers:[{id:'a2',question_id:'q2',private:false,text:'共有された語り',
    media:[{kind:'photo',path:'shared-photo'},{kind:'audio',path:'shared-audio'}]},
    {id:'a1',question_id:'q1',private:true,text:'非公開',media:[{kind:'photo',path:'private-photo'}]}]});

test('uses authoritative workspace and question IDs, never loads private media',async()=>{
  const signed=[];
  const data=await loadFamilySharedStories({workspace:async id=>{assert.equal(id,'mother');return fixture();},
    mediaUrl:async(kind,path)=>{signed.push([kind,path]);return '/signed/shared';}},'mother');
  assert.deepEqual(signed,[['photo','shared-photo']]);
  assert.equal(data.storyRows.length,1);
  assert.equal(data.storyRows[0].sequence_order,2);
  assert.equal(data.questionSet[1].content,'次の問い');
  assert.equal(data.project.subject_name,'母');
  assert.equal(JSON.stringify(data).includes('非公開'),false);
});
test('rejects subject or mismatched Person scope instead of relying on owner',async()=>{
  for(const change of [{role:'subject'},{project_id:'daughter'}]){
    await assert.rejects(loadFamilySharedStories({workspace:async()=>({...fixture(),...change})},'mother'));
  }
});
test('sharing revoked / unspecified visibility cannot be displayed',async()=>{
  const workspace=fixture();workspace.answers[0].private=undefined;
  const data=await loadFamilySharedStories({workspace:async()=>workspace,
    mediaUrl:async()=>assert.fail('must not sign hidden media')},'mother');
  assert.deepEqual(data.storyRows,[]);
});
test('read / media failures propagate rather than rendering stale content',async()=>{
  await assert.rejects(loadFamilySharedStories({workspace:async()=>{throw Error('denied');}},'mother'));
  await assert.rejects(loadFamilySharedStories({workspace:async()=>fixture(),mediaUrl:async()=>{throw Error('denied');}},'mother'));
});
