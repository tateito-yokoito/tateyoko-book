// A loopback-only real-media harness. TEST database, synthetic QA account.
// No production host, no live payment, no camera/microphone access until clicked.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {build} from 'esbuild';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--test-only');
const ref='zpswxefgfabzvxdbtyvq',cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const dir='output/book-milestones-live';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const stateFile='output/existing-supporter/state-private.json';
const prior=JSON.parse(fs.readFileSync(stateFile));assert.equal(prior.ref,ref);
const actor=prior.actors.mother;assert.ok(actor.email.endsWith('@example.invalid'));
const call=args=>execFileSync(cli,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
const raw=call(['projects','api-keys','--project-ref',ref,'--output','json']);
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const client=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await client.auth.setSession(actor.session);assert.ifError(login.error);
actor.session=login.data.session;fs.writeFileSync(stateFile,JSON.stringify(prior,null,2),{mode:0o600});
const query=sql=>{const raw=call(['db','query','--linked','--project-ref',ref,sql]);const r=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!r.error,r.error?.message);return r.rows;};
const file=`${dir}/state-private.json`;
let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
if(!state){
 const p=randomUUID(),o=randomUUID(),person=randomUUID();
 query(`begin;set local lock_timeout='3s';set local statement_timeout='30s';
 select id from profiles where id='${actor.id}' for update;
 insert into persons(id,family_id,display_name) values('${person}','${prior.family}','QA 節目専用の架空人物');
 insert into book_projects(id,family_id,owner_user_id,purchaser_user_id,subject_person_id,title,status,onboarding_status,onboarding_ritual_step)
 values('${p}','${prior.family}','${actor.id}','${actor.id}','${person}','QA 節目の実収録確認','active','completed','completed');
 insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,product_code,status,amount_subtotal,amount_total,discount_amount,base_book_amount,stripe_mode)
 values('${o}','${p}','${actor.id}','self','self_book_v1','checkout_pending',49800,0,49800,49800,'test');
 select register_experience_contract('${o}');
 update commerce_orders set status='zero_paid',purchased_at=now() where id='${o}';select confirm_experience_payment('${o}',now());
 update book_projects set access_status='paid',purchased_at=now(),commerce_order_id='${o}',product_code='self_book_v1' where id='${p}';
 update experience_contracts set production_started_at=now(),production_expires_at=now()+interval '1 year',main_experience_started_at=now(),main_started_by='${actor.id}' where order_id='${o}';
 insert into user_questions(user_id,book_project_id,question_id,sequence_order,is_active,chapter_title_snapshot,question_text_snapshot,meta_json,status)
 select '${actor.id}','${p}',q.id,(select coalesce(max(sequence_order),0) from user_questions where user_id='${actor.id}')+row_number() over(order by q.sequence_order),true,q.chapter,q.content,q.meta_json,'pending'
 from questions q where q.id in('TY_ONB04','TY_CLOSING01');commit;`);
 state={ref,projectId:p,actorId:actor.id};fs.writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
}
assert.equal(state.ref,ref);assert.equal(state.actorId,actor.id);
const {data:questions,error}=await client.from('user_questions').select('id,question_id,question_text_snapshot,chapter_title_snapshot,meta_json').eq('book_project_id',state.projectId);assert.ifError(error);assert.equal(questions.length,2);
const config={ref,url:`https://${ref}.supabase.co`,anon,session:login.data.session,projectId:state.projectId,questions};
await build({entryPoints:['scripts/tests/book-milestones.live-test.jsx'],bundle:true,format:'esm',jsx:'automatic',outfile:`${dir}/app.js`,define:{'import.meta.env':JSON.stringify({VITE_BOOK_MILESTONES_ENABLED:'true',VITE_SUPABASE_URL:config.url,VITE_SUPABASE_ANON_KEY:anon,VITE_PUBLIC_TEST_MODE:'true',VITE_EXPERIENCE_V2_TEST_ONLY:'true',VITE_EXPERIENCE_NOTIFICATIONS_ENABLED:'false'})}});
const css=fs.readdirSync('dist/assets').find(n=>n.startsWith('index-')&&n.endsWith('.css'));
const server=http.createServer((req,res)=>{
 if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){res.writeHead(403);return res.end();}
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(config));}
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(`${dir}/app.js`));}
 if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(`dist/assets/${css}`));}
 res.setHeader('Content-Type','text/html');res.end('<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEST実収録｜縦糸横糸</title><link rel="stylesheet" href="/app.css"><style>.app-container{min-height:100dvh;height:auto}.test-banner{position:fixed;bottom:0;left:0;right:0;z-index:10050;padding:12px;background:#342b16;color:#fff;text-align:center;font-size:12px}.fixed.inset-0{bottom:46px!important}</style><div id="root"></div><script type="module" src="/app.js"></script></html>');
});
// Keep the review link stable across server restarts.
server.listen(52536,'127.0.0.1',()=>console.log(`Real capture TEST: http://127.0.0.1:${server.address().port} (synthetic account, no production writes)`));
