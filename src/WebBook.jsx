import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2, ChevronDown, ArrowLeft } from 'lucide-react';
import { webBookSections, webBookStorySequence, webBookAudioSequence } from './lib/webBook.js';
import './web-book.css';
import CoverPhotoFrame from './CoverPhotoFrame.jsx';
import WebBookAudioPlayer,{audioTotal} from './WebBookAudioPlayer.jsx';
import WebBookMediaControls from './WebBookMediaControls.jsx';
import WebBookVideoPlayer from './WebBookVideoPlayer.jsx';

const time = seconds => Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}` : '';

// Same presentation for an authorized draft preview and an immutable published work.
// This component has no DB client and cannot publish, edit, or change sharing.
export default function WebBook({ publication, resolveAsset, previewLabel, onClose }) {
  const sections = webBookSections(publication);
  const sequence = useMemo(()=>webBookStorySequence(publication),[publication]);
  const audioSequence = useMemo(()=>webBookAudioSequence(sequence),[sequence]);
  const [story, setStory] = useState(null);
  const [opened, setOpened] = useState(new Set());
  const [playing, setPlaying] = useState(null);
  const [active, setActive] = useState(null);
  const [inlineHost,setInlineHost]=useState(null),[fixedHost,setFixedHost]=useState(null),[videoStart,setVideoStart]=useState(null);
  const [cover, setCover] = useState(publication.coverUrl || '');
  const [photos, setPhotos] = useState([]);
  const player = useRef(null), videoPlayer=useRef(null), ticket = useRef(0);
  const entryFor=item=>sequence.find(entry=>entry.item===item || (item?.sourceAnswerId && entry.item.sourceAnswerId===item.sourceAnswerId) || entry.item.order===item?.order);
  const storyEntry=story?entryFor(story):null;
  const nextEntry=sequence.find(entry=>entry.id===storyEntry?.nextId);
  const previousEntry=sequence.find(entry=>entry.id===storyEntry?.previousId);
  const storyVideo=storyEntry?.video || (story?sections.videoFor(story):null);
  const activeEntry=active?.item?entryFor(active.item):null;
  const audioIndex=audioSequence.findIndex(entry=>entry.id===activeEntry?.id);
  const primaryVideo=storyVideo && (story.mainFormat==='video' || !story.audio?.length);
  const audioInline=Boolean(story&&active?.key===`a${story.order}`);
  const showFixed=Boolean(active&&!audioInline);
  const mediaAsset = async (kind, item, index = 0, video = null) => {
    const direct = kind === 'video' ? video?.url : kind === 'cover' ? publication.coverUrl : (kind === 'photo' ? item.photos : item.audio)?.[index]?.url;
    return direct || resolveAsset({ kind, itemOrder: item?.order, assetIndex: (kind === 'photo' ? item?.photos : item?.audio)?.[index]?.assetIndex ?? index, videoIndex: video?.videoIndex });
  };
  useEffect(() => {
    let live = true;
    if (!publication.coverUrl && publication.hasCover) mediaAsset('cover').then(url => { if(live)setCover(url); }).catch(() => {});
    return () => { live = false; };
  }, [publication]);
  useEffect(() => {
    let live = true; setPhotos([]);
    if(story) Promise.all((story.photos || []).map((p,i) => mediaAsset('photo',story,i).then(url => ({...p,url})).catch(() => null))).then(rows => {if(live)setPhotos(rows.filter(Boolean));});
    return () => {live=false;};
  }, [story]);
  useEffect(() => () => {ticket.current++;}, []);
  const play = async (item, index = 0, video = null, continuous = false, force = false) => {
    if(video){player.current?.pause();setActive(null);setPlaying(null);const target=item||sequence.find(e=>e.video?.videoIndex===video.videoIndex)?.item;if(target){setVideoStart(video.videoIndex);setStory(target);window.scrollTo?.({top:0});}return;}
    videoPlayer.current?.pause();
    const key = video ? `v${video.videoIndex}` : `a${item.order}`;
    if(!force && active?.key === key && player.current) {
      player.current.togglePlayback();
      return;
    }
    const request = ++ticket.current;
    player.current?.pause();setPlaying(null);setActive({key,item,index,video,continuous,request});
  };
  // Start from any sequence entry; v1 exposes this on TOP only.
  const startContinuous = (entry=audioSequence[0]) => {if(entry)play(entry.item,0,null,true,true);};
  const moveAudio = offset => {
    const next=audioSequence[audioIndex+offset];
    if(next)play(next.item,0,null,true,true);
  };
  const button = (item,index=0,video=null,label='声を聴く',small=false) => <button type="button" className={`wb-play ${small?'wb-name-play':''}`} aria-label={label} onClick={() => play(item,index,video)}>{playing === (video?`v${video.videoIndex}`:`a${item.order}`) ? <Pause size={small?17:20}/> : small ? <Volume2 size={17}/> : <Play size={20}/>}</button>;
  const openStory = item => {setVideoStart(null);setStory(item);window.scrollTo?.({top:0});};
  const videoView=storyVideo?<WebBookVideoPlayer key={storyVideo.videoIndex} ref={videoPlayer} video={storyVideo} resolve={()=>mediaAsset('video',story,0,storyVideo)} autoStart={videoStart===storyVideo.videoIndex} onPlay={()=>{player.current?.pause();setPlaying(null);}}/>:null;
  const milestone = (item, closing=false) => {
    if(!item)return null;
    const video = sections.videoFor(item);
    const label = closing ? (video?'おわりを見る':'おわりの声を聴く') : (video?'はじまりを見る':'はじまりの声を聴く');
    return <section className="wb-milestone">{closing&&<h2>おわりの章</h2>}<div>{video || item.audio?.length ? button(item,0,video,label):null}<button className="wb-title-button" onClick={() => openStory(item)}>{label}</button></div></section>;
  };
  const row = item => <div className="wb-question" key={item.order}>{item.audio?.length ? button(item,0,null,`${item.question}を聴く`):null}<button className="wb-title-button" onClick={() => openStory(item)}>{item.question || item.chapterTitle}</button><small>{time(audioTotal(item.audio))}</small></div>;
  return <div className={`wb ${showFixed?'wb-has-player':''}`}>
    {previewLabel&&<aside className="wb-preview">{previewLabel}{onClose&&<button onClick={onClose}>確認を終える</button>}</aside>}
    <header className="wb-header"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸"/><span>Webブック</span></header>
    <main>
      {story ? <article className="wb-story"><button className="wb-back" onClick={() => {setStory(null);window.scrollTo?.({top:0});}}><ArrowLeft size={17}/>目次へ戻る</button>
        <p className="wb-eyebrow">{story.chapterTitle}</p><h1>{story.question}</h1>
        {photos[0]&&<figure><img src={photos[0].url} alt={photos[0].caption||'語りに添えられた写真'}/>{photos[0].caption&&<figcaption>{photos[0].caption}</figcaption>}</figure>}
        {!!story.audio?.length&&(!primaryVideo||audioInline||story.audio.some(part=>!part.videoId))&&<div className="wb-inline-audio" ref={setInlineHost}>{!audioInline&&<WebBookMediaControls total={audioTotal(story.audio)} onToggle={()=>play(story)}/>}</div>}
        {primaryVideo&&videoView}
        {story.transcript&&<p className="wb-prose">{story.transcript}</p>}
        {photos.slice(1).map((p,i)=><figure key={i}><img src={p.url} alt={p.caption||'語りに添えられた写真'}/>{p.caption&&<figcaption>{p.caption}</figcaption>}</figure>)}
        {storyVideo&&!primaryVideo&&videoView}
        {nextEntry&&<section className="wb-next-story" aria-label="次の語りへの案内"><p className="wb-eyebrow">{nextEntry.chapterKey===storyEntry?.chapterKey?'次の語り':<>次の章　<span>{nextEntry.chapterLabel}</span></>}</p><button onClick={()=>openStory(nextEntry.item)}><span>{nextEntry.title}</span><span aria-hidden="true">→</span></button></section>}
        {previousEntry&&<button className="wb-back wb-previous-story" onClick={()=>openStory(previousEntry.item)}>← 前の語り</button>}
      </article> : <>
        <section className={`wb-cover ${cover?'':'wb-cover-text'}`}><div className="wb-name"><h1>{publication.subjectName}</h1>{sections.name?.audio?.length ? button(sections.name,0,null,'名前の声を聴く',true):null}</div>{publication.title&&<p className="wb-book-title">{publication.title}</p>}{publication.subtitle&&<p className="wb-subtitle">{publication.subtitle}</p>}{cover&&<div className="wb-cover-photo" role="img" aria-label="BOOKの表紙写真"><CoverPhotoFrame photo={{url:cover,transform:publication.coverTransform}} backgroundColor="transparent" className="wb-cover-photo-frame"/></div>}{publication.footerText&&<p className="wb-date">{publication.footerText}</p>}</section>
        {!!audioSequence.length&&<div className="wb-listen-book-entry"><p className="wb-listen-label">連続再生</p><button className="wb-listen-book" onClick={()=>startContinuous()}><Play size={18} aria-hidden="true"/>声で、この人生を辿る</button></div>}
        {sections.now.some(Boolean)&&<section className="wb-now"><h2>今の私</h2>{sections.now.map((item,i)=>item&&<div className="wb-now-row" key={item.order}><div><button className="wb-title-button" onClick={()=>openStory(item)}>{i===0?'最近の暮らし':'日々の楽しみ'}</button>{item.transcript&&<p>{item.transcript}</p>}</div>{item.audio?.length?button(item,0,null,`${i===0?'最近の暮らし':'日々の楽しみ'}を聴く`):null}</div>)}</section>}
        {milestone(sections.opening)}
        {!!sections.themes.length&&<section className="wb-themes"><h2>人生をたどる</h2>{sections.themes.map(theme=><section key={theme.code}><button className="wb-theme" aria-expanded={opened.has(theme.code)} onClick={()=>setOpened(old=>{const n=new Set(old);n.has(theme.code)?n.delete(theme.code):n.add(theme.code);return n;})}><img src={theme.image} alt=""/><span className="wb-number">{String(theme.order).padStart(2,'0')}</span><span>{theme.label}</span><ChevronDown size={18} style={{transform:opened.has(theme.code)?'rotate(180deg)':undefined}}/></button>{opened.has(theme.code)&&<div className="wb-questions">{theme.items.map(row)}</div>}</section>)}</section>}
        {!!sections.other.length&&<section className="wb-other"><h2>残された語り</h2>{sections.other.map(row)}</section>}
        {milestone(sections.closing,true)}
        {sections.unassignedVideos.map(v=><section className="wb-inline" key={v.videoIndex}>{button(null,0,v,'映像を見る')}<span>{v.title||'映像を見る'}</span></section>)}
      </>}
      {storyEntry?.isLast&&<footer className="wb-book-ending">また、この人生に逢いにくる。<small>縦糸横糸 Webブック</small><button className="wb-back" onClick={()=>{setStory(null);window.scrollTo?.({top:0});}}>目次へ戻る</button></footer>}
    </main>
    {showFixed&&<aside className="wb-player" aria-label="再生プレイヤー">
      {activeEntry&&<p className="wb-player-chapter">{activeEntry.chapterLabel}</p>}
      <button className="wb-player-title" onClick={()=>active.item&&openStory(active.item)} disabled={!active.item}>{active.video?.title||active.item?.question}</button>
      <div ref={setFixedHost}/>
      <button className="wb-player-close" onClick={()=>{ticket.current++;player.current?.pause();setActive(null);setPlaying(null);}}>閉じる</button></aside>}
    {active&&<WebBookAudioPlayer queueKey={active.request} ref={player} audio={active.item.audio} controlsTarget={audioInline?inlineHost:fixedHost} resolve={index=>mediaAsset('audio',active.item,index)} onPlayingChange={value=>setPlaying(value?active.key:null)} onFinished={()=>{if(active.continuous&&audioIndex<audioSequence.length-1)moveAudio(1);}} onPrevious={active.continuous&&audioIndex>0?()=>moveAudio(-1):null} onNext={active.continuous&&audioIndex<audioSequence.length-1?()=>moveAudio(1):null} continuous={active.continuous&&!audioInline}/>}
  </div>;
}
