// Remote TEST only. Resume-safe runner; each successful browser step is recorded.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
assert.equal(process.env.QA_TEST_ORIGIN,'https://tateyoko-book-test.vercel.app');
assert.ok(process.env.QA_OUTPUT_DIR);
for(const caseName of ['A','B']) {
 const plan=[['create',1],...(caseName==='A'?[['record',3]]:[]),['purchase',1],['starting',1],['record',3],['main',1],['record',1],['append',1],['replace',1],['edit',1],['book',1]];
 const path=`${process.env.QA_OUTPUT_DIR}/${caseName}-private.json`;
 const completed=fs.existsSync(path)?JSON.parse(fs.readFileSync(path)).steps:[];
 for(let i=0;i<plan.length;i++){
  const [step,count]=plan[i];
  if(i<completed.length){assert.equal(completed[i].step,step);continue;}
  console.log(`START ${caseName} ${step} count=${count}`);
  const result=spawnSync(process.execPath,['scripts/tests/production-supporter.browser.mjs',caseName,step],{env:{...process.env,QA_RECORD_COUNT:String(count)},stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
 }
}
const result=spawnSync(process.execPath,['scripts/tests/production-self-smoke.browser.mjs'],{env:process.env,stdio:'inherit'});
process.exit(result.status||0);
