import test from 'node:test';
import assert from 'node:assert/strict';
import {createFamilyPhotoSaver} from '../../src/lib/familyPhoto.js';

test('saves into mother project and reuses upload after ambiguous commit failure',async()=>{
  const calls=[];let fail=true;
  const save=createFamilyPhotoSaver({reserve:async(p,file,kind)=>{
    calls.push([p,kind]);return{id:'photo'};
  },commitPhoto:async upload=>{calls.push(upload.id);if(fail){fail=false;throw Error('offline');}}},'mother');
  const file=new Blob(['test'],{type:'image/jpeg'});
  await assert.rejects(save(file));await save(file);await save(file);
  assert.deepEqual(calls,[['mother','photo'],'photo','photo']);
});
test('double confirmation has only one reservation and commit',async()=>{
  let uploads=0,commits=0;
  const save=createFamilyPhotoSaver({reserve:async()=>{uploads++;return{id:'photo'};},
    commitPhoto:async()=>{commits++;}},'mother');
  const file=new Blob(['test']);await Promise.all([save(file),save(file)]);
  assert.equal(uploads,1);assert.equal(commits,1);
});
