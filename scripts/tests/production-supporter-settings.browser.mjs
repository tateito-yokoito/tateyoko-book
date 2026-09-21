// Offline component acceptance: no accounts, network, SMS, or real mutations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {chromium}=await import(process.env.QA_PLAYWRIGHT_PATH);
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Settings from './src/FamilyProductionSupporters.jsx';
 window.calls=[];window.deny=false;let rows=[{supporter_user_id:'supporter-1',display_name:'娘'}];
 const api={productionSupporters:async p=>{if(p!=='project-1')throw Error('scope');return rows;},revokeProduction:async(p,s)=>{window.calls.push([p,s]);if(window.deny)throw Error('Forbidden');rows=[];}};
 createRoot(document.getElementById('root')).render(<Settings api={api} projectId='project-1'/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
const html=`<div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext();await context.route('**/*',r=>r.abort());
 const page=await context.newPage();await page.setContent(html);
 const button=page.getByRole('button',{name:'制作サポートを停止'});await button.waitFor();
 page.once('dialog',d=>d.dismiss());await button.click();assert.deepEqual(await page.evaluate(()=>window.calls),[]);
 await page.evaluate(()=>{window.deny=true;});page.once('dialog',d=>d.accept());await button.click();
 await page.getByRole('alert').waitFor();assert.equal(await button.count(),1,'Failed revoke never appears successful');
 await page.evaluate(()=>{window.deny=false;});page.once('dialog',d=>d.accept());await button.click();
 await page.getByText('制作を任せているサポーターはいません。',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls),[['project-1','supporter-1'],['project-1','supporter-1']]);
 console.log('PASS subject settings: cancel / refusal / explicit stop / refresh; OFFLINE mocked API, not SMS E2E');
}finally{await browser.close();}
