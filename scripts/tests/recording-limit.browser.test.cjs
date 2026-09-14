const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
(async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'recording-limit-qa-'));
  await build({entryPoints:[path.join(__dirname,'recording-limit.fixture.jsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},outfile:path.join(temp,'fixture.js'),plugins:[{name:'mock',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'client',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClient = () => window.mockClient;'}));
  }}]});
  const css=fs.readdirSync('dist/assets').find(n=>n.endsWith('.css'));
  const server=http.createServer((req,res)=>{
    if(req.url==='/fixture.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(temp,'fixture.js')));}
    else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join('dist/assets',css)));}
    else{res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    async function pageFor(suffix='',real=false){
      const page=await browser.newPage({viewport:{width:390,height:844}});
      page.errors=[]; page.on('pageerror',e=>page.errors.push(e.message));
      if(!real) await page.clock.install();
      await page.addInitScript(real=>{
        window.completed=[]; window.calls=[]; window.recorders=[];
        console.log=()=>{};
        window.SpeechRecognition=undefined; window.webkitSpeechRecognition=undefined;
        if(real){
          navigator.mediaDevices.getUserMedia=async()=>{
            const ctx=new AudioContext(), osc=ctx.createOscillator(), out=ctx.createMediaStreamDestination();
            osc.connect(out);osc.start();await ctx.resume();window.testAudioContext=ctx;return out.stream;
          };
        }else{
          navigator.mediaDevices.getUserMedia=async()=>({active:true,getTracks:()=>[{kind:'audio',enabled:true,readyState:'live',stop(){}}]});
          window.MediaRecorder=class {
            static isTypeSupported(){return true;}
            constructor(){this.state='inactive';this.mimeType='audio/mp4';this.stopCount=0;window.recorders.push(this);}
            start(){this.state='recording';}
            pause(){this.state='paused';} resume(){this.state='recording';}
            requestData(){this.ondataavailable?.({data:new Blob(['retained-part'],{type:this.mimeType})});}
            stop(){this.stopCount++;this.state='inactive';this.ondataavailable?.({data:new Blob(['final-part'],{type:this.mimeType})});queueMicrotask(()=>this.onstop?.());}
          };
        }
        window.mockClient={
          storage:{from:()=>({upload:async(p,blob)=>{window.calls.push({type:'upload',path:p,size:blob.size});return{error:window.failUpload?{message:'Offline'}:null};}})},
          functions:{invoke:async(name,{body})=>{
            window.calls.push({type:name,body});
            return {error:window.failTranscription?{message:'Transcription unavailable'}:null,data:{success:true,transcript_raw:'今回の語り',transcript_readable:'今回の語り',transcript_essay:'今回の語り'}};
          }},
          rpc:async(name,args)=>{window.calls.push({type:'save',name,args});return{error:window.failSave?{message:'Save unavailable'}:null,data:'saved-answer'};}
        };
      },real);
      await page.goto(base+suffix);return page;
    }
    const p=await pageFor();
    await p.clock.runFor(4000);
    await p.getByRole('button',{name:'録音を終了',exact:true}).waitFor();
    assert.equal(await p.getByText(/あと1分で/).count(),0);
    await p.clock.runFor(536000); // 538 seconds since recording began in the countdown.
    assert.equal(await p.getByText(/あと1分で/).count(),0);
    await p.clock.runFor(2000);
    await p.getByText(/あと1分で/).waitFor();
    await p.screenshot({path:path.join(temp,'warning.png')});
    await p.getByRole('button',{name:'録音を一時停止',exact:true}).click();
    await p.clock.runFor(120000);
    assert.equal(await p.evaluate(()=>window.completed.length),0);
    await p.getByRole('button',{name:'録音を再開',exact:true}).click();
    await p.clock.runFor(60000);
    await p.getByText('10分になったため、録音を区切りました。',{exact:true}).waitFor();
    assert.deepEqual(await p.evaluate(()=>window.completed.map(x=>({duration:x.duration,stopReason:x.stopReason}))),[{duration:600,stopReason:'limit'}]);
    assert.equal(await p.evaluate(()=>window.recorders[0].stopCount),1);
    assert.ok(await p.evaluate(()=>window.completed[0].size>0));
    assert.equal(await p.evaluate(()=>window.lastBlob.text()),'retained-partfinal-part','The last audio chunk is retained');
    assert.equal(await p.getByRole('button',{name:'少し話し足す',exact:true}).isEnabled(),true);
    await p.clock.runFor(1000);
    await p.screenshot({path:path.join(temp,'limit-review.png')});
    await p.getByRole('button',{name:'少し話し足す',exact:true}).click();
    await p.clock.runFor(4000);
    assert.equal(await p.getByText(/あと1分で/).count(),0);
    await p.getByRole('button',{name:'録音を終了',exact:true}).click();
    await p.clock.runFor(2000);
    assert.equal(await p.getByText('10分になったため、録音を区切りました。',{exact:true}).count(),0);
    assert.deepEqual(p.errors,[]);await p.close();

    const s=await pageFor('/?support=1');
    const start=async()=>{
      await s.getByRole('button',{name:'録音を始める',exact:true}).click();
      // Existing supporter flow includes the recorder's own start screen.
      if(await s.getByRole('button',{name:'録音を始める',exact:true}).count()) await s.getByRole('button',{name:'録音を始める',exact:true}).click();
      await s.clock.runFor(4000);
    };
    await start();
    await s.evaluate(()=>window.failUpload=true);
    await s.clock.runFor(600000);
    await s.getByRole('button',{name:'保存をもう一度試す'}).waitFor();
    assert.equal(await s.evaluate(()=>window.calls.filter(c=>c.type==='save').length),0);
    await s.evaluate(()=>{window.failUpload=false;window.failTranscription=true;});
    await s.getByRole('button',{name:'保存をもう一度試す'}).click();
    await s.getByText(/文字起こしを取得できませんでした。音声はアップロード済み/).waitFor();
    await s.clock.runFor(1000);
    await s.screenshot({path:path.join(temp,'supporter-review.png'),fullPage:true});
    await s.evaluate(()=>window.failSave=true);
    await s.getByRole('button',{name:'保存して続きを話す'}).click();
    await s.getByText('語りを保存できませんでした。もう一度お試しください。',{exact:true}).waitFor();
    assert.equal(await s.evaluate(()=>window.recorders.length),1,'Failed save must not start another recording');
    await s.evaluate(()=>{window.failSave=false;window.failTranscription=false;window.failRefresh=true;});
    await s.getByRole('button',{name:'保存して続きを話す'}).click();
    await s.getByRole('button',{name:'録音を始める',exact:true}).waitFor();
    const saves1=await s.evaluate(()=>window.calls.filter(c=>c.type==='save'));
    assert.equal(saves1[0].args.input_answer_id,saves1[1].args.input_answer_id,'Retry uses same segment ID');
    assert.equal(saves1[1].args.input_transcript_readable,'','Audio-only save is allowed');
    assert.equal(await s.getByText('次の問いです',{exact:true}).count(),0,'Question stays pinned after refresh');
    await s.getByRole('button',{name:'録音を始める',exact:true}).click();
    await s.clock.runFor(10000);
    await s.getByRole('button',{name:'録音を終了',exact:true}).click();
    await s.clock.runFor(2000);
    await s.getByRole('button',{name:'この内容で保存する',exact:true}).click();
    await s.getByText('声を保存しました',{exact:true}).waitFor();
    const saves=await s.evaluate(()=>window.calls.filter(c=>c.type==='save'));
    assert.equal(saves.length,3);
    assert.ok(saves.every(c=>c.name==='append_supporter_recording'&&c.args.input_user_question_id==='question-1'));
    assert.notEqual(saves[2].args.input_answer_id,saves[1].args.input_answer_id);
    const uploads=await s.evaluate(()=>window.calls.filter(c=>c.type==='upload'));
    assert.equal(uploads[0].path,uploads[1].path,'Upload retry keeps the same bytes/path');
    assert.notEqual(uploads[2].path,uploads[1].path,'Continuation has a new immutable path');
    assert.deepEqual(s.errors,[]);await s.close();

    // A real local MediaRecorder must deliver a decodable final audio blob too.
    const r=await pageFor('',true);
    await r.getByRole('button',{name:'録音を終了',exact:true}).waitFor();
    await r.waitForTimeout(2100);
    await r.getByRole('button',{name:'録音を終了',exact:true}).click();
    await r.getByRole('button',{name:'少し話し足す',exact:true}).waitFor();
    const decoded=await r.evaluate(async()=>{const c=new AudioContext();const b=await c.decodeAudioData(await window.lastBlob.arrayBuffer());await c.close();return{duration:b.duration,length:b.length};});
    assert.ok(decoded.duration>2&&decoded.length>0);
    assert.deepEqual(r.errors,[]);await r.close();
    console.log(`PASS browser: 9-minute warning, pause exclusion, 10-minute stop once, continuation, support upload/save retry, audio-only save, question pinning, distinct segment paths, real decodable MediaRecorder audio. Screenshots: ${temp}`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
