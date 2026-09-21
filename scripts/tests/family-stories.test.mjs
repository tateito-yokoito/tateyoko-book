import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFamilyStoryAccess} from '../../src/lib/familyStories.js';

function setup(role='subject',can_produce=false){
 const calls=[];let fail=false;
 const workspace={project_id:'mother',role,can_produce,questions:[{id:'q',text:'母の問い',chapter:'幼い頃',answered:true}]};
 const rows={answers:[{id:'a',book_project_id:'mother',user_question_id:'q',transcript_edited:'母の語り',selected_style:'readable'}],
 media_assets:[{id:'m',answer_id:'a',book_project_id:'mother',asset_type:'audio',storage_path:'daughter/original'}]};
 const client={from(table){calls.push({table});const query={select(){return query;},eq(field,value){calls.push({field,value});return query;},in(){return query;},async order(){return{data:rows[table]};}};return query;},
 async rpc(name,body){calls.push({name,body});if(fail){fail=false;return{error:{code:'offline'}};}return{};}};
 const api={async workspace(){return workspace;},async mediaUrl(kind,path){return`https://fixture.invalid/${kind}/${path}`;},async reserve(){calls.push({reserved:true});return{id:'upload'};}};
 return{access:createFamilyStoryAccess(client,api,'mother'),calls,rows,fail(){fail=true;}};
}
test('subject reader uses project and question UUID, not historical actor sequence',async()=>{
 const s=setup(),data=await s.access.list();
 assert.equal(data.answers[0].sequence_order,1);assert.equal(data.questionSet[0].chapter_label,'幼い頃');
 assert.equal(data.mediaByAnswerId.a[0].url,'https://fixture.invalid/audio/daughter/original');
 assert.equal(s.calls.some(c=>c.field==='user_id'),false);
});
test('unconfirmed legacy supporter is denied before private table query or mutation',async()=>{
 const s=setup('supporter');await assert.rejects(()=>s.access.list());
 await assert.rejects(()=>s.access.saveEdit({id:'a'},'readable','ATTACK'));
 assert.deepEqual(s.calls,[]);
});
test('confirmed production supporter can read and edit; Viewer cannot',async()=>{
 const s=setup('supporter',true);
 assert.equal((await s.access.list()).answers.length,1);
 await s.access.saveEdit(s.rows.answers[0],'readable','制作編集');
 assert.ok(s.calls.some(c=>c.name==='family_edit_story'));
 const viewer=setup('viewer',true);await assert.rejects(()=>viewer.access.list());assert.deepEqual(viewer.calls,[]);
});
test('wrong project or missing question fails closed',async()=>{
 const s=setup();s.rows.answers[0].book_project_id='other';await assert.rejects(()=>s.access.list());
 s.rows.answers[0].book_project_id='mother';s.rows.answers[0].user_question_id='unknown';await assert.rejects(()=>s.access.list());
});
test('editor sends optimistic snapshot; photo retry keeps same upload',async()=>{
 const s=setup(),answer=s.rows.answers[0];await s.access.saveEdit(answer,'essay','編集');
 assert.deepEqual(s.calls[0],{name:'family_edit_story',body:{p:'mother',answer_id:'a',style:'essay',body:'編集',expected:{style:'readable',body:'母の語り'}}});
 const file=new Blob(['photo']);s.fail();await assert.rejects(()=>s.access.addPhoto(file,'a','old'));
 await s.access.addPhoto(file,'a','old');assert.equal(s.calls.filter(c=>c.reserved).length,1);
 assert.deepEqual(s.calls.filter(c=>c.name==='family_attach_story_photo').map(c=>c.body.upload_id),['upload','upload']);
});
