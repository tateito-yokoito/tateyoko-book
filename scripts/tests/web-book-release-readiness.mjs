// Read-only release inventory. Never deploy, set secrets, invoke app RPCs, or touch Stripe.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--read-only');
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const ref='wquxjeqkumossjxehdop',dir='output/web-book-source-audit';
const list=args=>{const raw=execFileSync(cli,[...args,'--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4000000});return JSON.parse(raw.slice(raw.indexOf('[')));};
const names=['public-voice','create-checkout-session','publish-voice-edition','sync-checkout-session','stripe-webhook','cancel-book-completion','web-book-preview'];
const edges=list(['functions','list']);
const secrets=list(['secrets','list']);
const hash=value=>createHash('sha256').update(value).digest('hex');
const configs=Object.entries({BOOK_COMPLETION_ENABLED:['false','true'],FAMILY_PRODUCTION_ENABLED:['false','true'],APP_URL:['https://www.tateito-yokoito.jp','https://www.tateito-yokoito.jp/'],EXPERIENCE_COMMERCE_MODE:['live','test']}).map(([name,values])=>{
 const s=secrets.find(s=>s.name===name);return {name,present:!!s,value:s?values.find(v=>hash(v)===(s.digest??s.value))||'unverified':null};
});
const response=await fetch('https://www.tateito-yokoito.jp/',{redirect:'error'});assert.equal(response.status,200);
const html=await response.text();
const front={origin:response.url,status:response.status,etag:response.headers.get('etag'),sha256:hash(html),assets:[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(m=>m[1]),deploymentHints:[...new Set(html.match(/dpl_[A-Za-z0-9]+/g)||[])]};
const report={at:new Date().toISOString(),ref,readOnly:true,secretValuesRead:false,edges:names.map(slug=>{const e=edges.find(e=>e.slug===slug);return e?{slug,version:e.version,verify_jwt:e.verify_jwt,sha256:e.ezbr_sha256}:{slug,absent:true};}),configs,front};
writeFileSync(`${dir}/release-inventory.json`,JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report,null,2));
