import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {familyJourney} from '../../src/home/familyHomeModel.js';
const questions=[
 ...Array.from({length:3},(_,i)=>({id:'trial'+i,sequence_order:9011+i,group:'trial_experience',theme_code:'ty_theme_childhood',available:true,answered:false})),
 ...Array.from({length:3},(_,i)=>({id:'open'+i,sequence_order:i+1,group:'starting_conversation',available:false,answered:false})),
 {id:'motive',sequence_order:4,group:'starting_motivation',available:false,answered:false},
 {id:'main',sequence_order:5,theme_code:'ty_theme_childhood',available:false,answered:false},
];
test('free journey chooses trial, not locked paid introduction',()=>{const j=familyJourney({questions,answers:[]});assert.equal(j.next.id,'trial0');assert.equal(j.model.theme.total,3);});
test('purchase and two explicit consent boundaries remain distinct',()=>{
 const done=questions.map(q=>({...q,answered:q.group==='trial_experience'}));
 assert.equal(familyJourney({questions:done}).stage,'purchase');
 assert.equal(familyJourney({questions:done,access:{paid:true}}).stage,'startingConsent');
 assert.equal(familyJourney({questions:done,access:{paid:true,can_create:true,production_started_at:'now'}}).stage,'starting');
 assert.equal(familyJourney({questions:done,ritual_step:'chapter_complete',access:{paid:true,can_create:true,production_started_at:'now'}}).stage,'mainConsent');
 const j=familyJourney({questions:done.map(q=>({...q,available:true})),access:{paid:true,can_create:true,main_started_at:'now',production_started_at:'now'}});
 assert.equal(j.next.id,'main');assert.equal(j.model.theme.total,1);
});
test('PWA uses stable non-secret start URL and retains original mark',()=>{
 const m=JSON.parse(fs.readFileSync('public/pwa/manifest.webmanifest'));assert.equal(m.display,'standalone');
 assert.equal(m.start_url,'/?app=1');assert.equal(m.name,'縦糸横糸');
 for(const i of m.icons)assert.ok(fs.existsSync('public'+i.src));
 const sw=fs.readFileSync('public/pwa-sw.js','utf8');assert.ok(!sw.includes('caches.'));
 assert.ok(!fs.readFileSync('index.html','utf8').includes('user-scalable=no'));
});
test('main journey does not repeat skipped or fully resolved themes',()=>{
 const access={paid:true,can_create:true,main_started_at:'now',production_started_at:'now'};
 const main=[{id:'skipped',sequence_order:5,theme_code:'ty_theme_childhood',available:true,skipped:true},
 {id:'next',sequence_order:6,theme_code:'ty_theme_youth',available:true}];
 assert.equal(familyJourney({questions:main,access}).next.id,'next');
 assert.equal(familyJourney({questions:main.map(q=>({...q,answered:true})),access}).next,null);
});
