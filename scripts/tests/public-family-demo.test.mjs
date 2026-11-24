import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { publicDemoClient as client, publicDemoUser, resetPublicDemo,
  publicDemoMemories, savePublicDemoMemory } from '../../src/lib/familyPlacePublicDemo.js';
import { addFamilyPlacePerson, familyPlacePeople, familyPlaceRelations,
  saveFamilyPlaceRelation, updateFamilyPlacePerson, getOrCreateFamilyPlaceStory,
  saveFamilyPlaceStory, familyPlaceStories, addFamilyPlaceMedia, familyPlaceMedia,
  revokeFamilyPlaceMediaUrls } from '../../src/lib/familyPlaceData.js';

globalThis.crypto ||= webcrypto;
const values = new Map();
globalThis.sessionStorage = {
  getItem:key => values.get(key) ?? null,
  setItem:(key,value) => values.set(key,value),
};
globalThis.FileReader = class {
  readAsDataURL(file) {
    file.arrayBuffer().then(bytes => {
      this.result = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;
      this.onload();
    }).catch(error => { this.error = error; this.onerror(); });
  }
};

test('public demo uses the production person and relation operations with local state', async () => {
  resetPublicDemo();
  assert.equal(publicDemoUser.id,'demo-user');
  assert.equal((await familyPlacePeople(client,'demo-family')).length,5);
  const id = await addFamilyPlacePerson(client,'demo-family',{
    family_name:'架空',given_name:'結',family_name_kana:'',given_name_kana:'',
    birth_year:'',birth_month:'',birth_day:'',gender:'',
  },false,'self','child');
  assert.equal((await familyPlacePeople(client,'demo-family')).find(p => p.id === id)?.display_name,'架空 結');
  assert.equal((await familyPlaceRelations(client,'demo-family')).filter(r => r.person_b_id === id).length,1);
  await updateFamilyPlacePerson(client,id,{
    family_name:'架空',given_name:'ゆい',family_name_kana:'',given_name_kana:'',
    birth_year:'2018',birth_month:'',birth_day:'',death_year:'',
    maiden_name:'',maiden_name_kana:'',notes:'',gender:'female',
  });
  assert.equal((await familyPlacePeople(client,'demo-family')).find(p => p.id === id)?.birth_year,2018);
  await assert.rejects(() => saveFamilyPlaceRelation(client,'demo-family',id,'self','child'),/循環/);
  await assert.rejects(() => saveFamilyPlaceRelation(client,'demo-family','self',id,'child'),/登録済み/);
  await saveFamilyPlaceRelation(client,'demo-family','spouse',id,'child');
  assert.equal((await familyPlaceRelations(client,'demo-family')).filter(r => r.person_b_id === id).length,2);
  assert.equal((await client.functions.invoke('transcribe-audio')).error.message,
    'この機能は公開デモでは利用できません');

  const person = (await familyPlacePeople(client,'demo-family')).find(item => item.id === 'self');
  const question = { id:'TY_TRIAL_CHILDHOOD01', slot:1, text:'幼い頃、どんなところに住んでいましたか？' };
  const story = await getOrCreateFamilyPlaceStory(client,'demo-user',person,question,'family');
  const saved = await saveFamilyPlaceStory(client,story,{
    body:'小さな町で育ちました。',transcript_raw:'',transcript_readable:'',transcript_essay:'',
  });
  assert.equal((await familyPlaceStories(client,'self'))[0].body,'小さな町で育ちました。');
  const photo = new File(['fictional-photo'],'demo.jpg',{type:'image/jpeg'});
  await addFamilyPlaceMedia(client,'demo-user',saved.id,photo,'photo');
  const media = await familyPlaceMedia(client,saved.id);
  assert.equal(media.length,1);
  assert.equal(media[0].asset_type,'photo');
  revokeFamilyPlaceMediaUrls(media);
  await savePublicDemoMemory('self',{title:'庭の思い出',event_date:'2020-04-01',comment:'春の一日'},photo);
  assert.equal(publicDemoMemories('self')[0].title,'庭の思い出');
  resetPublicDemo();
  assert.equal((await familyPlaceStories(client,'self')).length,0);
  assert.equal(publicDemoMemories('self').length,0);
});
