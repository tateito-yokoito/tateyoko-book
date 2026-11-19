import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, Home, Image, LockKeyhole, Mic, Pencil, Plus, Users } from 'lucide-react';
import { Scene_Login, Scene_Recording, PhotoCorrectionFlow, ensureProfileExists, supabaseClient } from './App.jsx';
import { AnswerBodyEditor, AnswerEntryChoices, AnswerReview, AnswerSaveStatus } from './AnswerInputUI.jsx';
import { CHILDHOOD_TRIAL_QUESTIONS } from './lib/childhoodTrial.js';
import {
  ensureFamilyPlace, familyPlacePeople, addFamilyPlacePerson, updateFamilyPlacePerson,
  familyPlaceFacts, saveFamilyPlaceFact, familyPlaceTimeline, familyPlaceStories,
  getOrCreateFamilyPlaceStory, saveFamilyPlaceStory, familyPlaceMedia, addFamilyPlaceMedia,
  setFamilyPlaceStoryVisibility,
} from './lib/familyPlaceData.js';
import './family-place.css';

// TEST-only provisional prompts. The owner will select the final person-based
// questions; this route remains disabled in production builds until then.
const testQuestions = CHILDHOOD_TRIAL_QUESTIONS.map((question, index) =>
  ({ id: question.id, slot: index + 1, text: question.content }));

export default function FamilyPlaceApp() {
  const [user, setUser] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [people, setPeople] = useState([]);
  const [selfId, setSelfId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [screen, setScreen] = useState('home');
  const [profile, setProfile] = useState(null);
  const [factDraft, setFactDraft] = useState(null);
  const [facts, setFacts] = useState([]);
  const [stories, setStories] = useState([]);
  const [newName, setNewName] = useState('');
  const [newIsSelf, setNewIsSelf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeStory, setActiveStory] = useState(null);
  const [media, setMedia] = useState([]);
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [recordingError, setRecordingError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [storyQuestion, setStoryQuestion] = useState(null);
  const [activeTab, setActiveTab] = useState('life');
  const storyRef = useRef(null);
  const textRef = useRef('');
  const savedTextRef = useRef('');
  const saveTimer = useRef(null);
  const savePromiseRef = useRef(null);
  const pendingAudioRef = useRef(null);
  const guardRef = useRef(null);
  const person = people.find(item => item.id === selectedId) || null;

  const loadHome = useCallback(async currentUser => {
    // Scene_Login handles both email OTP and LINE. On an OAuth return the
    // session can exist before Scene_Login mounts, so finish the same profile
    // initialization here without creating a legacy BOOK project.
    await ensureProfileExists(currentUser);
    const id = await ensureFamilyPlace(supabaseClient, currentUser,
      currentUser.user_metadata?.display_name
        ? `${currentUser.user_metadata.display_name}さんの家族` : null);
    const [persons, links] = await Promise.all([
      familyPlacePeople(supabaseClient, id),
      supabaseClient.from('user_person_links').select('person_id')
        .eq('user_id', currentUser.id).eq('role', 'self').limit(1),
    ]);
    if (links.error) throw links.error;
    setFamilyId(id);
    setPeople(persons);
    setSelfId(links.data?.[0]?.person_id || null);
  }, []);
  const loadPerson = useCallback(async personId => {
    const [nextFacts, nextStories] = await Promise.all([
      familyPlaceFacts(supabaseClient, personId),
      familyPlaceStories(supabaseClient, personId),
    ]);
    setFacts(nextFacts);
    setStories(nextStories);
  }, []);
  useEffect(() => {
    let live = true;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (live) setUser(data.session?.user || null);
    }).catch(() => {});
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (live) setUser(session?.user || null);
    });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!user) return;
    loadHome(user).catch(cause => setError(cause.message || '家族の場所を開けませんでした'));
  }, [user?.id, loadHome]);
  useEffect(() => {
    if (!selectedId) return;
    loadPerson(selectedId).catch(cause => setError(cause.message || '人物を開けませんでした'));
  }, [selectedId, loadPerson]);
  useEffect(() => {
    const warn = event => {
      if (!pendingAudioRef.current && textRef.current === savedTextRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const openPerson = id => {
    setError(''); setSelectedId(id); setActiveTab('life'); setScreen('person');
  };
  const goHome = async () => {
    if (screen === 'recording' && guardRef.current) {
      guardRef.current(() => { setScreen('story'); });
      return;
    }
    if (activeStory && (textRef.current !== savedTextRef.current || savePromiseRef.current)) {
      try { await flushText(); } catch { setError('保存できていません。再試行してください'); return; }
    }
    setActiveStory(null); setSelectedId(null); setScreen('home');
    if (user) await loadHome(user);
  };
  const leaveStory = async () => {
    clearTimeout(saveTimer.current);
    if (textRef.current !== savedTextRef.current || savePromiseRef.current) {
      try { await flushText(); }
      catch { setError('保存できていません。再試行してください'); return; }
    }
    setScreen('person');
    if (person) await loadPerson(person.id);
  };
  const createPerson = async event => {
    event.preventDefault();
    if (!familyId || !newName.trim()) return;
    setBusy(true); setError('');
    try {
      const id = await addFamilyPlacePerson(supabaseClient, familyId, newName, newIsSelf);
      await loadHome(user);
      setNewName(''); setNewIsSelf(false);
      openPerson(id);
    } catch (cause) { setError(cause.message || '登録できませんでした'); }
    finally { setBusy(false); }
  };
  const startProfile = () => {
    setProfile({ display_name: person.display_name, birth_year: person.birth_year || '',
      death_year: person.death_year || '', maiden_name: person.maiden_name || '',
      notes: person.notes || '' });
    setScreen('profile');
  };
  const saveProfile = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await updateFamilyPlacePerson(supabaseClient, person.id, profile);
      await loadHome(user);
      setScreen('person');
    } catch (cause) { setError(cause.message || '保存できませんでした'); }
    finally { setBusy(false); }
  };
  const saveFact = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await saveFamilyPlaceFact(supabaseClient, user.id, person, factDraft);
      await loadPerson(person.id);
      setFactDraft(null);
    } catch (cause) { setError(cause.message || '出来事を保存できませんでした'); }
    finally { setBusy(false); }
  };
  const openStory = async question => {
    if (!person || !user) return;
    setBusy(true); setError('');
    try {
      const visibility = person.id === selfId ? 'private' : 'family';
      const row = await getOrCreateFamilyPlaceStory(supabaseClient, user.id, person, question, visibility);
      const items = await familyPlaceMedia(supabaseClient, row.id);
      storyRef.current = row; setActiveStory(row); setStoryQuestion(question);
      textRef.current = row.body || ''; savedTextRef.current = row.body || '';
      setBody(row.body || ''); setMedia(items); setSaveState('saved');
      setScreen('story');
      await loadPerson(person.id);
    } catch (cause) { setError(cause.message || '記録を開けませんでした'); }
    finally { setBusy(false); }
  };
  const flushText = async () => {
    if (!storyRef.current) return;
    if (savePromiseRef.current) return savePromiseRef.current;
    const operation = (async () => {
      try {
      while (textRef.current !== savedTextRef.current) {
        const nextText = textRef.current;
        setSaveState('saving');
        const updated = await saveFamilyPlaceStory(supabaseClient, storyRef.current, {
          body: nextText,
          transcript_raw: storyRef.current.transcript_raw || '',
          transcript_readable: storyRef.current.transcript_readable || '',
          transcript_essay: storyRef.current.transcript_essay || '',
        });
        storyRef.current = updated; setActiveStory(updated);
        savedTextRef.current = nextText;
      }
      setSaveState('saved');
      if (person) await loadPerson(person.id);
      } catch (cause) { setSaveState('failed'); throw cause; }
    })();
    savePromiseRef.current = operation;
    try { return await operation; }
    finally { savePromiseRef.current = null; }
  };
  const editBody = value => {
    textRef.current = value; setBody(value); setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushText().catch(cause => setError(cause.message || '文章を保存できませんでした'));
    }, 700);
  };
  const changeVisibility = async next => {
    if (next === activeStory?.visibility) return;
    setError('');
    try {
      clearTimeout(saveTimer.current);
      if (textRef.current !== savedTextRef.current || savePromiseRef.current) await flushText();
      setSaveState('saving');
      const updated = await setFamilyPlaceStoryVisibility(supabaseClient, storyRef.current, next);
      storyRef.current = updated; setActiveStory(updated);
      setSaveState('saved');
    } catch (cause) { setSaveState('failed'); setError(cause.message || '公開範囲を変更できませんでした'); }
  };
  const saveMedia = async (file, kind, seconds) => {
    setError('');
    clearTimeout(saveTimer.current);
    if (textRef.current !== savedTextRef.current || savePromiseRef.current) await flushText();
    setSaveState('saving');
    const item = await addFamilyPlaceMedia(supabaseClient, user.id, storyRef.current.id, file, kind, seconds);
    const refreshed = await familyPlaceMedia(supabaseClient, storyRef.current.id);
    setMedia(refreshed); setSaveState('saved');
    await loadPerson(person.id);
    return item;
  };
  const addPhoto = async file => {
    try { await saveMedia(file, 'photo'); setPhotoOpen(false); }
    catch (cause) { setSaveState('failed'); setError(cause.message || '写真を保存できませんでした'); throw cause; }
  };
  const processAudio = async path => {
    const story = storyRef.current;
    const transcript = await supabaseClient.functions.invoke('transcribe-audio', { body: {
      freeStoryId: story.id, answerId: story.id, questionText: story.question_text, audioPaths: [path],
    } });
    if (transcript.error || !transcript.data?.success)
      throw transcript.error || new Error(transcript.data?.error || '文字起こしに失敗しました');
    const raw = transcript.data.transcript_raw || '';
    const polish = await supabaseClient.functions.invoke('polish-transcript', { body: {
      freeStoryId: story.id, answerId: story.id, questionText: story.question_text, transcriptRaw: raw,
    } });
    if (polish.error || !polish.data?.success)
      throw polish.error || new Error(polish.data?.error || '文章整形に失敗しました');
    const readable = polish.data.transcript_readable || raw;
    const updated = await saveFamilyPlaceStory(supabaseClient, storyRef.current, {
      body: readable, transcript_raw: raw, transcript_readable: readable,
      transcript_essay: polish.data.transcript_essay || '',
    });
    storyRef.current = updated; setActiveStory(updated);
    textRef.current = readable; savedTextRef.current = readable; setBody(readable);
    setSaveState('saved'); setRecordingError('');
  };
  const onRecorded = async (_transcript, seconds, _url, blob) => {
    pendingAudioRef.current = blob;
    try {
      const item = await saveMedia(blob, 'audio', Math.round(seconds));
      pendingAudioRef.current = null;
      setScreen('story');
      try { await processAudio(item.path); }
      catch (cause) { setRecordingError(cause.message || '文字起こしを再試行してください'); }
      return true;
    } catch (cause) {
      setSaveState('failed'); setRecordingError(cause.message || '音声を保存できませんでした');
      return false;
    }
  };

  if (!user) return <div className="fp-auth"><Scene_Login onLogin={() =>
    supabaseClient.auth.getUser().then(({ data }) => setUser(data.user))} /></div>;
  if (!familyId) return <main className="fp-app"><p>家族の場所を準備しています…</p>{error && <p role="alert">{error}</p>}</main>;
  if (screen === 'recording' && activeStory) return <div className="fp-recorder">
    <Scene_Recording question={{ content: activeStory.question_text, question_role: 'story_question' }}
      lightMode autoStart progress={{ currentIndex: 0, total: 1 }}
      userName={person?.display_name || 'あなた'}
      referencePhotos={media.filter(item => item.asset_type === 'photo').map(item => item.url)}
      registerExitGuard={guard => { guardRef.current = guard; }}
      onBack={() => setScreen('story')} onComplete={onRecorded} />
    {recordingError && <div className="fp-record-error" role="alert">{recordingError}
      {pendingAudioRef.current && <button onClick={async () => {
        const blob = pendingAudioRef.current;
        await onRecorded('', 0, '', blob);
      }}>音声保存を再試行する</button>}</div>}
  </div>;
  return <div className="fp-app">
    <header className="fp-header">
      {screen === 'home' ? <span className="fp-brand"><Home size={22}/> 縦糸∞横糸</span>
        : <button onClick={() => screen === 'story' ? leaveStory()
          : screen === 'profile' ? setScreen('person')
          : screen === 'person' ? goHome() : setScreen('home')}><ChevronLeft/>戻る</button>}
      <span>{screen === 'home' ? '家族の場所' : person?.display_name || '家族の場所'}</span>
    </header>
    {error && <p className="fp-error" role="alert">{error}</p>}
    {screen === 'home' && <main>
      <section className="fp-hero"><h1>家族のチカラは、<br/>人生を照らす。</h1><small>背景はレビュー用の仮素材です</small></section>
      <section className="fp-section"><h2>家族の人生の物語</h2>
        <div className="fp-card fp-empty-book"><BookOpen/><div><strong>家族の物語は、ここから</strong>
          <p>人物を登録すると、その人の記録がここに並びます。</p></div></div>
        <p className="fp-note">BOOK作品は、購入・制作を始めるまで作成されません。</p>
      </section>
      <section className="fp-section"><h2>家族の人たち</h2>
        {people.map(item => <button className="fp-card fp-person-row" key={item.id}
          onClick={() => openPerson(item.id)}><span className="fp-avatar">{item.display_name.slice(0,1)}</span>
          <span><strong>{item.display_name}</strong><small>人物ページを見る</small></span><span>›</span></button>)}
        {!people.length && <p className="fp-note">まずは自分か家族を一人登録しましょう。</p>}
        <button className="fp-primary" onClick={() => setScreen('add-person')}><Plus/>自分・家族を登録する</button>
      </section>
      <nav className="fp-quick"><a href="/?app=1">BOOK制作へ</a><span>家系図・思い出は次の段階で追加します</span></nav>
    </main>}
    {screen === 'add-person' && <main className="fp-section"><h1>家族を登録する</h1>
      <form onSubmit={createPerson} className="fp-form">
        <label>どなたを登録しますか？<select value={newIsSelf ? 'self' : 'family'}
          onChange={event => setNewIsSelf(event.target.value === 'self')}>
          <option value="family">家族</option><option value="self" disabled={Boolean(selfId)}>自分</option>
        </select></label>
        <label>お名前<input required maxLength={100} value={newName} onChange={event => setNewName(event.target.value)}/></label>
        <p className="fp-note">詳しいプロフィールは後から追加できます。</p>
        <button className="fp-primary" disabled={busy}>登録して人物ページを見る</button>
      </form></main>}
    {screen === 'person' && person && <main>
      <section className="fp-person-head"><span className="fp-avatar fp-avatar-large">{person.display_name.slice(0,1)}</span>
        <div><h1>{person.display_name}</h1>{person.birth_year && <p>{person.birth_year}年生まれ</p>}
        {person.notes && <p>{person.notes}</p>}</div></section>
      <button className="fp-profile-link" onClick={startProfile}>プロフィールを見る・編集する ›</button>
      <div className="fp-tabs" role="tablist">
        {[['life','人生'],['memories','思い出'],['timeline','年表']].map(([key,label]) =>
          <button key={key} role="tab" aria-selected={activeTab===key}
            onClick={() => setActiveTab(key)}>{label}</button>)}
      </div>
      {activeTab === 'life' && <section className="fp-section">
        <h2>人生の語り</h2>
        {!stories.some(row => row.body || row.transcript_raw || row.media_count) && <div className="fp-card fp-empty-story">
          <BookOpen/><strong>人生の語りは、これから</strong>
          <p>思い出したことから、声・文章・写真で残せます。</p></div>}
        {stories.filter(row => row.body || row.transcript_raw || row.media_count).map(row =>
          <button className="fp-card fp-story-row" key={row.id}
            onClick={() => openStory(testQuestions[row.question_slot-1])}>
            <span>{row.visibility === 'private' && <LockKeyhole size={15}/>}
              {row.question_text}</span><small>保存した語りを見る ›</small></button>)}
        <p className="fp-note">質問文は技術検証用です。正式な無料3問は選定後に反映します。</p>
        {testQuestions.map(question => <button key={question.id} className="fp-outline"
          disabled={busy} onClick={() => openStory(question)}>
          {question.slot}問目：{question.text}</button>)}
      </section>}
      {activeTab === 'memories' && <section className="fp-section"><h2>思い出</h2>
        <p className="fp-note">家族の思い出カードは次の実装段階です。</p></section>}
      {activeTab === 'timeline' && <section className="fp-section"><h2>年表</h2>
        {familyPlaceTimeline(person,facts).length
          ? familyPlaceTimeline(person,facts).map(item => <div className="fp-card fp-timeline" key={item.id}>
            <time>{item.year ? `${item.year}年${item.month ? item.month+'月' : ''}${item.day ? item.day+'日' : ''}` : '時期未登録'}</time>
            <strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}</div>)
          : <p className="fp-note">登録した事実だけを年表に表示します。</p>}
        <button className="fp-outline" onClick={() => {setFactDraft({fact_type:'education',label:'',event_year:'',event_month:'',event_day:'',detail:''});setScreen('profile');}}>出来事を登録する</button>
      </section>}
    </main>}
    {screen === 'profile' && person && <main className="fp-section"><h1>プロフィール</h1>
      <form className="fp-form" onSubmit={saveProfile}>
        <label>氏名<input required maxLength={100} value={profile?.display_name || ''}
          onChange={event => setProfile({...profile,display_name:event.target.value})}/></label>
        <label>旧姓（任意）<input value={profile?.maiden_name || ''}
          onChange={event => setProfile({...profile,maiden_name:event.target.value})}/></label>
        <label>生年（分かる場合）<input type="number" min="1800" max="2200" value={profile?.birth_year || ''}
          onChange={event => setProfile({...profile,birth_year:event.target.value})}/></label>
        <label>没年（分かる場合）<input type="number" min="1800" max="2200" value={profile?.death_year || ''}
          onChange={event => setProfile({...profile,death_year:event.target.value})}/></label>
        <label>紹介（任意）<textarea value={profile?.notes || ''}
          onChange={event => setProfile({...profile,notes:event.target.value})}/></label>
        <button className="fp-primary" disabled={busy}>プロフィールを保存する</button>
      </form>
      <h2>人生の出来事</h2>
      {facts.map(item => <button className="fp-card fp-fact" key={item.id} onClick={() => setFactDraft(item)}>
        {item.event_year || '年未登録'}　{item.label}　›</button>)}
      <button className="fp-outline" onClick={() => setFactDraft({
        fact_type:'education',label:'',event_year:'',event_month:'',event_day:'',detail:'',
      })}>出来事を追加する</button>
      {factDraft && <form className="fp-form fp-card" onSubmit={saveFact}>
        <label>種類<select value={factDraft.fact_type}
          onChange={event => setFactDraft({...factDraft,fact_type:event.target.value})}>
          <option value="education">学歴</option><option value="employment">職歴</option>
          <option value="marriage">結婚</option><option value="residence">居住</option>
          <option value="birth">誕生</option><option value="death">逝去</option>
        </select></label>
        <label>出来事<input required maxLength={120} value={factDraft.label}
          onChange={event => setFactDraft({...factDraft,label:event.target.value})}/></label>
        <div className="fp-date"><label>年<input type="number" min="1800" max="2200" value={factDraft.event_year || ''}
          onChange={event => setFactDraft({...factDraft,event_year:event.target.value})}/></label>
          <label>月<input type="number" min="1" max="12" value={factDraft.event_month || ''}
          onChange={event => setFactDraft({...factDraft,event_month:event.target.value})}/></label>
          <label>日<input type="number" min="1" max="31" value={factDraft.event_day || ''}
          onChange={event => setFactDraft({...factDraft,event_day:event.target.value})}/></label></div>
        <label>補足（任意）<textarea value={factDraft.detail || ''}
          onChange={event => setFactDraft({...factDraft,detail:event.target.value})}/></label>
        <button className="fp-primary" disabled={busy}>出来事を保存する</button>
      </form>}
    </main>}
    {screen === 'story' && activeStory && <main className="fp-section fp-answer">
      <p className="fp-overline">人生の語り　{activeStory.question_slot} / 3</p>
      <h1>{activeStory.question_text}</h1>
      <p className="fp-note">保存先：{person.display_name}さんの人物ページ
        {activeStory.visibility === 'private' ? '・🔒自分だけ' : '・家族の場所'}</p>
      {person.id === selfId && <label className="fp-visibility">この語りの公開範囲
        <select value={activeStory.visibility} disabled={saveState === 'saving'} onChange={event => changeVisibility(event.target.value)}>
          <option value="private">🔒自分だけ</option><option value="family">家族に共有</option>
        </select></label>}
      {media.length===0 && !body && <AnswerEntryChoices
        onVoice={() => setScreen('recording')}
        onWrite={() => document.querySelector('.answer-body-editor')?.focus()}
        onPhoto={() => setPhotoOpen(true)}/>}
      <AnswerBodyEditor value={body} onChange={editBody} label="人生の語りを文章で残す"/>
      <AnswerReview body={body} photos={media.filter(item => item.asset_type==='photo')}
        audio={media.filter(item => item.asset_type==='audio')}
        saveState={saveState} onRetry={() => flushText().catch(cause => setError(cause.message))}
        onVoice={() => setScreen('recording')} onWrite={() => document.querySelector('.answer-body-editor')?.focus()}
        onPhoto={() => setPhotoOpen(true)} showChoices={media.length>0 || Boolean(body)}
        finishLabel="人物ページに戻る" canFinish={saveState==='saved' && !pendingAudioRef.current}
        onFinish={leaveStory}/>
      {recordingError && <div className="fp-error" role="alert">{recordingError}
        {media.some(item => item.asset_type === 'audio') && <button onClick={() => {
          const latest = [...media].reverse().find(item => item.asset_type === 'audio');
          if (latest) processAudio(latest.storage_path).catch(cause => setRecordingError(cause.message));
        }}>文字起こし・文章整形を再試行する</button>}</div>}
      {activeStory.transcript_raw && <div className="fp-card fp-style">
        <p>元の音声と文字起こしは保持しています。文章を編集しても戻せます。</p>
        <button onClick={() => editBody(activeStory.transcript_raw)}>そのまま</button>
        <button onClick={() => editBody(activeStory.transcript_readable || activeStory.transcript_raw)}>語り調</button>
        {activeStory.transcript_essay && <button onClick={() => editBody(activeStory.transcript_essay)}>作品調</button>}
      </div>}
      <PhotoCorrectionFlow open={photoOpen} awaitCompletion title="写真を添える"
        onClose={() => setPhotoOpen(false)} onComplete={addPhoto}/>
    </main>}
    {screen !== 'recording' && <nav className="fp-bottom">
      <button onClick={goHome}><Home/>ホーム</button>
      <button onClick={() => {setScreen('home');setSelectedId(null);}}><BookOpen/>人生の物語</button>
      <button onClick={() => {setScreen('home');setSelectedId(null);}}><Users/>家族</button>
      <button disabled><Image/>思い出</button>
    </nav>}
  </div>;
}
