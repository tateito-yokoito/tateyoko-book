import React from 'react';
import {createRoot} from 'react-dom/client';
import WebBook from '../../src/WebBook.jsx';
import {STORY_THEMES} from '../../src/lib/storyThemes.js';
import {OPENING_TEXT,CLOSING_TEXT} from '../../src/lib/bookMilestones.js';

const params=new URLSearchParams(location.search), variant=params.get('case')||'photo';
const audio='/site/hp-renewal/sample-voice.wav';
const clip=assetIndex=>({assetIndex,url:audio,durationSeconds:6.470884});
const item=(order,questionId,question,transcript,extra={})=>({order,sourceAnswerId:`a${order}`,questionId,question,transcript,audio:[clip(0)],photos:[],...extra});
const items=[
 item(1,'TY_ONB01','お名前をフルネームで教えてください。','確認用のサンプルです。'),
 item(2,'TY_ONB02','最近は、どんなふうに一日を過ごすことが多いですか？','朝は庭の様子を眺めて、お茶を飲みます。ゆっくりした時間が好きです。'),
 item(3,'TY_ONB03','日々の中で、楽しみにしている時間や出来事はありますか？','散歩の途中で季節の花を見つけること。家族と電話で話す時間も楽しみです。'),
 item(4,'TY_ONB04',OPENING_TEXT,'忘れていたことを、少しずつ思い出してみようと思います。',{slot:'opening',chapterTitle:'はじまりの章'}),
 ...STORY_THEMES.flatMap((t,i)=>[
 item(5+i,`sample-${i}`,FORMAL_QUESTIONS[t.code][0],i===0?'家の前には、小さな川が流れていました。\n\n学校から帰ると、近所の友達とよく遊びに行きました。夕方に名前を呼ばれると、急いで家へ帰ったものです。':'振り返ってみると、その時間が今の私をつくってくれたように思います。',{themeCode:t.code,chapterTitle:t.label,audio:[clip(0),...(i===0?[clip(1)]:[])],photos:i===0?[{assetIndex:0,url:t.image,caption:'確認用の写真（正式テーマ画像を仮置き）'}]:[]}),
 ...(i===0?[
 item(5.1,'sample-first-2',FORMAL_QUESTIONS[t.code][1],'友達と遊んだ日々。あとから思い出した話も、ここでは一つの文章として残っています。',{themeCode:t.code,chapterTitle:t.label,audio:[clip(0),clip(1),clip(2)]}),
 item(5.2,'sample-first-3',FORMAL_QUESTIONS[t.code][2],'あの頃のことを、今でもよく覚えています。',{themeCode:t.code,chapterTitle:t.label})]:[])
 ]),
 item(14,'TY_CLOSING01',CLOSING_TEXT,'こうして振り返ると、たくさんの人に支えられてきたのだと感じます。',{slot:'closing',chapterTitle:'おわりの章'})
];
const publication={subjectName:'サンプル 太郎',title:'歩んできた日々',subtitle:'大切な人へ',footerText:'2026.09',coverUrl:variant==='photo'?'/site/theme-childhood-triptych.jpg':'',items:variant==='minimal'?items.filter(i=>[1,5].includes(i.order)).map(i=>({...i,audio:[],photos:[]})):variant==='no-milestones'?items.filter(i=>!i.slot):items,videos:[]};
const root=createRoot(document.getElementById('root'));
async function render() {
 if(variant==='video') {
  root.render(<p>確認用映像を準備しています…</p>);
  // Synthetic local video; no camera/microphone permission or personal recordings.
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#263e31';ctx.fillRect(0,0,480,270);ctx.fillStyle='#faf9f5';ctx.font='24px serif';ctx.textAlign='center';ctx.fillText('Webブック・確認用映像',240,140);
  const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream),chunks=[];
  const finished=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>resolve(URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType})));});
  recorder.start();const timer=setInterval(()=>{ctx.fillRect(20,230,Math.random()*430,2);},100);
  await new Promise(resolve=>setTimeout(resolve,1200));recorder.stop();const url=await finished;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());
  publication.videos=[{videoIndex:0,sourceAnswerId:'a4',slot:'opening',title:'はじまりの声',url},{videoIndex:1,sourceAnswerId:'a14',slot:'closing',title:'おわりの声',url}];
  items.find(i=>i.order===4).mainFormat='video';
  items.find(i=>i.order===4).audio=[];
 }
 root.render(<><nav style={{background:'#e5e8df',padding:12,font:'12px system-ui',display:'flex',gap:12,flexWrap:'wrap'}}>{[['photo','写真あり'],['no-photo','写真なし'],['no-milestones','節目なし'],['minimal','音声・写真なし'],['video','動画あり']].map(([key,label])=><a key={key} href={`?case=${key}`} style={{color:'#263e31'}}>{label}</a>)}</nav><WebBook key={variant} publication={publication} resolveAsset={()=>Promise.reject(Error('Sample unavailable'))} previewLabel="操作確認用・架空の回答／サンプル音声"/></>);
}
render().catch(()=>root.render(<p>このブラウザでは確認用動画を作成できません。<a href="/">音声版を開く</a></p>));
