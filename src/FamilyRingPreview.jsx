import React, { useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import FamilyPersonPage from './FamilyPersonPage.jsx';
import { SAMPLE_WEB_BOOK_ID } from './WebBookCover.jsx';
import { STORY_PHOTO_LIMIT, storyPhotoLimitMessage } from './lib/storyPhotoLimit.js';
import './family-ring-preview.css';

const person = { id:'preview-person', display_name:'紡木 誠', family_name:'紡木', given_name:'誠', gender:'male', birth_year:1981, notes:'家族の時間と、写真を大切にしています。' };
const initialStories = [
  ['はじまりの章','ご自身のお名前を教えてください。','紡木誠です。家族と過ごす時間を大切にしています。'],
  ['はじまりの章','最近は、どんなふうに一日を過ごすことが多いですか？','朝は庭の木々を眺めてから、一日を始めます。'],
  ['幼い頃のこと','子どもの頃は、どのあたりで暮らしていましたか？','岩手県の小さな町で育ちました。夏は川で遊び、冬は家族で雪を眺めました。'],
  ['幼い頃のこと','子どもの頃に、家族と過ごした思い出はありますか？','お正月には祖父母の家で、みんなで食卓を囲みました。'],
  ['学生時代','学校で、今でもよく覚えている出来事はありますか？','文化祭の準備を、友人と遅くまで続けたことを覚えています。'],
  ['学生時代','仲の良かった友達や、心に残っている先生はどんな方でしたか？','いつも話を聞いてくれる友人がいました。卒業後も手紙を交わしました。'],
  ['仕事と家族','仕事を始めた頃、どんな気持ちでしたか？','毎日が新しい発見で、緊張と楽しさが一緒にありました。'],
  ['仕事と家族','家族と過ごす時間で、大切にしていることは何ですか？','何気ない夕食の会話を、これからも大切にしたいです。'],
].map(([theme,question,body],index) => ({ source:'book', id:`preview-${index+1}`, projectId:'preview-project', theme, question, body, visibility:index===5?'private':'family', hasAudio:index===2 || index===5, photoCount:index===2?1:0, completed:false, preview:true }));
const previewPhotos = { 'preview-3':['/site/theme-childhood-classroom.jpg'] };
const memory = { id:'preview-memory', photo_url:'/site/webbook-sample-cover-sage.jpg', title:'家族で歩いた春の日', event_date:'2023-04-08', comment:'桜の下で、これからのことを話しました。' };
const facts = [
  { id:'preview-fact-1', year:1981, label:'岩手県で生まれる', detail:'家族の最初の記録' },
  { id:'preview-fact-2', year:2000, label:'大学へ進学', detail:'新しい友人に出会う' },
  { id:'preview-fact-3', year:2016, label:'家族が増える', detail:'暮らしの景色が変わった年' },
];
const completedBook = { publication_id:'preview-publication', public_id:SAMPLE_WEB_BOOK_ID, title:'紡木 誠', subtitle:'45年目の現在地', subject_name:'紡木 誠', published_at:'2026-10-16' };
const previewPublication = { subjectName:'紡木 誠', title:'紡木 誠', subtitle:'45年目の現在地' };

export default function FamilyRingPreview() {
  const [tab,setTab] = useState('ring');
  const [mode,setMode] = useState('active');
  const [stories,setStories] = useState(initialStories);
  const storyMedia = useRef({});
  const [notice,setNotice] = useState('');
  const showRecords = mode !== 'empty';
  const visibleStories = showRecords ? stories.map(story => ({...story,completed:mode==='complete'})) : [];
  const onSave = async (story,body) => {
    const updated={...story,body,hasAudio:story.hasAudio || Boolean(
      storyMedia.current[story.id]?.some(item => item.kind === 'audio')),
      photoCount:(previewPhotos[story.id]?.length || 0)
        + (storyMedia.current[story.id] || []).filter(item => item.kind === 'photo').length};
    setStories(current => current.map(row => row.id===story.id
      ? {...row,body,hasAudio:updated.hasAudio,photoCount:updated.photoCount} : row));
    return updated;
  };
  const onLock = async (story,locked) => {
    const updated={...story,visibility:locked?'private':'family'};
    setStories(current => current.map(row => row.id===story.id ? updated : row));
    return updated;
  };
  const onAddMedia = (story,file,kind) => {
    if (kind === 'photo' && (previewPhotos[story.id]?.length || 0)
      + (storyMedia.current[story.id] || []).filter(item => item.kind === 'photo').length >= STORY_PHOTO_LIMIT)
      throw new Error(storyPhotoLimitMessage);
    storyMedia.current[story.id] = [
      ...(storyMedia.current[story.id] || []),{id:crypto.randomUUID(),kind,blob:file},
    ];
    setStories(current => current.map(row => row.id === story.id
      ? {...row,hasAudio:row.hasAudio || kind === 'audio',
        photoCount:(row.photoCount || 0) + (kind === 'photo' ? 1 : 0)} : row));
  };
  const onLoadMedia = async story => [
    ...(previewPhotos[story.id] || []).map((url,index) => ({
      id:`sample-${story.id}-${index}`,kind:'photo',url,
    })),
    ...(storyMedia.current[story.id] || []).map(item => ({
      id:item.id,kind:item.kind,url:URL.createObjectURL(item.blob),
    })),
  ];
  const onLoadListPhotos = async story => [
    ...(previewPhotos[story.id] || []).map((url,index) => ({
      id:`sample-${story.id}-${index}`,kind:'photo',url,
    })),
    ...(storyMedia.current[story.id] || []).filter(item => item.kind === 'photo')
      .slice(0,Math.max(0,3-(previewPhotos[story.id]?.length || 0)))
      .map(item => ({id:item.id,kind:'photo',url:URL.createObjectURL(item.blob)})),
  ].slice(0,3);
  const explain = () => setNotice('このPreviewは架空データです。実際の登録・制作データは変更しません。');
  return <div className="fp-ring-preview-shell">
    <div className="fp-ring-preview-controls">
      <p className="fp-ring-preview-banner"><BookOpen size={17}/>人物ページの操作Preview ・ 架空データ。語りを開き、右上の「…」から編集できます。AI候補は表示例です。</p>
      <div role="group" aria-label="表示する状態">
        {[['active','制作中・記録あり'],['complete','完成済み'],['empty','記録なし']].map(([key,label]) =>
          <button type="button" key={key} aria-pressed={mode===key} onClick={() => {setMode(key);setTab('ring');setNotice('');}}>{label}</button>)}
      </div>
      {notice && <p role="status">{notice}</p>}
    </div>
    <FamilyPersonPage key={mode} person={person} activeTab={tab} onTabChange={setTab}
      onBack={explain} onProfile={explain} backLabel="ホーム"
      ringStories={visibleStories} ringCanEdit onSaveRingStory={onSave} onLockRingStory={onLock}
      onPolishRingStory={async (_story,body,style) => style==='essay'
        ? `思い出を振り返ると、${body.trim()} その時間が、今の自分につながっています。`
        : `${body.trim().replace(/。?$/,'。')}`}
      onLoadRingMedia={onLoadMedia} onAddRingPhoto={(story,file) => onAddMedia(story,file,'photo')}
      onLoadRingListPhotos={onLoadListPhotos}
      onAddRingVoice={async (story,blob,_seconds,options) => {
        if (options?.analyzeOnly) return {raw:'家族と過ごした日のことを、今も覚えています。',
          readable:'家族と過ごした日のことを、今も覚えています。',
          essay:'家族と過ごしたあの日の光景は、今も心に残っています。'};
        onAddMedia(story,blob,'audio');
        return onSave(story,options.body);
      }}
      books={mode==='complete'?[completedBook]:[]} booksStatus="ready"
      publishedPublication={mode==='complete'?previewPublication:null} publicDemo
      visibleBookProjects={mode==='active'?[{id:'preview-project',access_status:'paid'}]:[]}
      projectsStatus="ready" onResumeBook={mode==='active'?explain:null}
      onOpenBook={mode==='empty'?explain:null}
      memories={showRecords?[memory]:[]} onAddMemory={explain}
      facts={showRecords?facts:[]} onAddFact={explain}
      questions={[]} onOpenStory={explain}/>
  </div>;
}
