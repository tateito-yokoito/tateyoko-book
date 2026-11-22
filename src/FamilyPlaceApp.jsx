import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, Home, Image, Users } from 'lucide-react';
import { Scene_Login, Scene_Recording, PhotoCorrectionFlow, ensureProfileExists, supabaseClient } from './App.jsx';
import { AnswerBodyEditor, AnswerEntryChoices, AnswerReview, AnswerSaveStatus } from './AnswerInputUI.jsx';
import { CHILDHOOD_TRIAL_QUESTIONS } from './lib/childhoodTrial.js';
import FamilyHome, { FamilyHomeNav } from './FamilyHome.jsx';
import FamilyPersonPage from './FamilyPersonPage.jsx';
import FamilyTree from './FamilyTree.jsx';
import {
  ensureFamilyPlace, familyPlacePeople, familyPlacePublishedBooks, addFamilyPlacePerson, updateFamilyPlacePerson,
  familyPlaceRelations, saveFamilyPlaceRelation, removeFamilyPlaceRelation,
  personNameParts, uploadFamilyPlacePortrait, familyPlacePortraitUrl,
  familyPlaceFacts, saveFamilyPlaceFact, familyPlaceTimeline, familyPlaceStories,
  getOrCreateFamilyPlaceStory, saveFamilyPlaceStory, familyPlaceMedia, addFamilyPlaceMedia,
  setFamilyPlaceStoryVisibility, revokeFamilyPlaceMediaUrls,
} from './lib/familyPlaceData.js';
import './family-place.css';

// TEST-only provisional prompts. The owner will select the final person-based
// questions; this route remains disabled in production builds until then.
const testQuestions = CHILDHOOD_TRIAL_QUESTIONS.map((question, index) =>
  ({ id: question.id, slot: index + 1, text: question.content }));

const emptyPersonDraft = () => ({ family_name: '', given_name: '',
  birth_year: '', birth_month: '', birth_day: '', gender: '' });

function YearSelect({ value, onChange, allowFuture = false }) {
  const currentYear = new Date().getFullYear();
  const latestYear = Math.max(allowFuture ? 2200 : currentYear, Number(value) || 0);
  return <select value={value || ''} onChange={event => onChange(event.target.value)}>
    <option value="">未登録</option>
    {Array.from({ length: latestYear - 1799 }, (_, index) => latestYear - index)
      .map(year => <option value={year} key={year}>{year}年</option>)}
  </select>;
}

function BirthDateFields({ value, onChange }) {
  const year = Number(value.birth_year) || 0;
  const month = Number(value.birth_month) || 0;
  const days = year && month ? new Date(year, month, 0).getDate() : 0;
  return <fieldset className="fp-birth-date">
    <legend>生年月日（分かる範囲で）</legend>
    <div className="fp-date">
      <label>年<YearSelect value={value.birth_year} onChange={next => onChange({
        ...value, birth_year: next, birth_month: '', birth_day: '',
      })}/></label>
      <label>月<select value={value.birth_month || ''} disabled={!year} onChange={event => onChange({
        ...value, birth_month: event.target.value, birth_day: '',
      })}><option value="">未登録</option>{Array.from({length:12},(_,index) =>
        <option value={index+1} key={index+1}>{index+1}月</option>)}</select></label>
      <label>日<select value={value.birth_day || ''} disabled={!month} onChange={event => onChange({
        ...value, birth_day: event.target.value,
      })}><option value="">未登録</option>{Array.from({length:days},(_,index) =>
        <option value={index+1} key={index+1}>{index+1}日</option>)}</select></label>
    </div>
    <p className="fp-note">年だけ、または年月だけでも登録できます。</p>
  </fieldset>;
}

function EventDateFields({ value, onChange }) {
  const year = Number(value.event_year) || 2000;
  const month = Number(value.event_month) || 0;
  const days = month ? new Date(year, month, 0).getDate() : 0;
  return <fieldset className="fp-birth-date">
    <legend>出来事の年月日（分かる範囲で）</legend>
    <div className="fp-date">
      <label>年<YearSelect value={value.event_year} allowFuture onChange={next => onChange({
        ...value, event_year: next, event_day: '',
      })}/></label>
      <label>月<select value={value.event_month || ''} onChange={event => onChange({
        ...value, event_month: event.target.value, event_day: '',
      })}><option value="">未登録</option>{Array.from({length:12},(_,index) =>
        <option value={index+1} key={index+1}>{index+1}月</option>)}</select></label>
      <label>日<select value={value.event_day || ''} disabled={!month} onChange={event => onChange({
        ...value, event_day: event.target.value,
      })}><option value="">未登録</option>{Array.from({length:days},(_,index) =>
        <option value={index+1} key={index+1}>{index+1}日</option>)}</select></label>
    </div>
    <p className="fp-note">年だけ、または年月だけでも登録できます。</p>
  </fieldset>;
}

export default function FamilyPlaceApp() {
  const [user, setUser] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [people, setPeople] = useState([]);
  const [relations, setRelations] = useState([]);
  const [treeCenterId, setTreeCenterId] = useState(null);
  const [newPersonAnchorId, setNewPersonAnchorId] = useState(null);
  const [newPersonRelation, setNewPersonRelation] = useState('');
  const [homeStoryCounts, setHomeStoryCounts] = useState({});
  const [selfId, setSelfId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [screen, setScreen] = useState('home');
  const [profile, setProfile] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const portraitUrlsRef = useRef(new Map());
  const [factDraft, setFactDraft] = useState(null);
  const [facts, setFacts] = useState([]);
  const [stories, setStories] = useState([]);
  const [publishedBooks, setPublishedBooks] = useState([]);
  const [booksStatus, setBooksStatus] = useState('loading');
  const [newPerson, setNewPerson] = useState(emptyPersonDraft);
  const [newIsSelf, setNewIsSelf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeStory, setActiveStory] = useState(null);
  const [media, setMedia] = useState([]);
  const mediaRef = useRef([]);
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [recordingError, setRecordingError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [storyQuestion, setStoryQuestion] = useState(null);
  const [activeTab, setActiveTab] = useState('ring');
  const storyRef = useRef(null);
  const textRef = useRef('');
  const savedTextRef = useRef('');
  const saveTimer = useRef(null);
  const savePromiseRef = useRef(null);
  const pendingAudioRef = useRef(null);
  const guardRef = useRef(null);
  const personLoadEpoch = useRef(0);
  const shelfReturnPerson = useRef((() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'books' ? params.get('person') : null;
  })());
  const shelfReturnPublication = useRef((() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'books' ? params.get('publication') : null;
  })());
  const person = people.find(item => item.id === selectedId) || null;

  useEffect(() => () => { if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview); }, [profilePhotoPreview]);
  useEffect(() => () => { portraitUrlsRef.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  const loadHome = useCallback(async currentUser => {
    // Scene_Login handles both email OTP and LINE. On an OAuth return the
    // session can exist before Scene_Login mounts, so finish the same profile
    // initialization here without creating a legacy BOOK project.
    await ensureProfileExists(currentUser);
    const id = await ensureFamilyPlace(supabaseClient, currentUser,
      currentUser.user_metadata?.display_name
        ? `${currentUser.user_metadata.display_name}さんの家族` : null);
    const [persons, links, nextRelations] = await Promise.all([
      familyPlacePeople(supabaseClient, id),
      supabaseClient.from('user_person_links').select('person_id')
        .eq('user_id', currentUser.id).eq('role', 'self'),
      familyPlaceRelations(supabaseClient, id),
    ]);
    if (links.error) throw links.error;
    const portraits = await Promise.all(persons.map(async item => {
      const path = item.portrait_storage_path;
      if (!path) return null;
      if (portraitUrlsRef.current.has(path)) return portraitUrlsRef.current.get(path);
      const url = await familyPlacePortraitUrl(supabaseClient, path);
      if (url) portraitUrlsRef.current.set(path, url);
      return url;
    }));
    const storyLists = await Promise.all(persons.map(item => familyPlaceStories(supabaseClient, item.id)));
    const counts = Object.fromEntries(persons.map((item, index) => [item.id,
      storyLists[index].filter(row => row.body || row.transcript_raw || row.media_count).length]));
    setFamilyId(id);
    setPeople(persons.map((item, index) => ({ ...item, portrait_url: portraits[index] })));
    setRelations(nextRelations);
    setHomeStoryCounts(counts);
    setSelfId(links.data?.find(link => persons.some(item => item.id === link.person_id))?.person_id || null);
  }, []);
  const loadPerson = useCallback(async personId => {
    const epoch = ++personLoadEpoch.current;
    setBooksStatus('loading');
    const [nextFacts, nextStories, bookResult] = await Promise.all([
      familyPlaceFacts(supabaseClient, personId),
      familyPlaceStories(supabaseClient, personId),
      familyPlacePublishedBooks(supabaseClient, personId)
        .then(data => ({ data })).catch(error => ({ error })),
    ]);
    if (epoch !== personLoadEpoch.current) return;
    setFacts(nextFacts);
    setStories(nextStories);
    if (bookResult.error) { setPublishedBooks([]); setBooksStatus('error'); }
    else { setPublishedBooks(bookResult.data); setBooksStatus('ready'); }
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
    const id = shelfReturnPerson.current;
    if (!id || screen !== 'home' || !people.some(item => item.id === id)) return;
    shelfReturnPerson.current = null;
    setSelectedId(id);
    setActiveTab('books');
    setScreen('person');
    const url = new URL(window.location.href);
    url.searchParams.delete('person');
    url.searchParams.delete('tab');
    window.history.replaceState({}, '', url);
  }, [people, screen]);
  useEffect(() => {
    const publicId = shelfReturnPublication.current;
    if (!publicId || !familyId || screen !== 'home') return;
    let live = true;
    Promise.all(people.map(async item => {
      try { return (await familyPlacePublishedBooks(supabaseClient, item.id))
        .some(book => book.public_id === publicId) ? item.id : null; }
      catch { return null; }
    })).then(matches => {
      if (!live) return;
      shelfReturnPublication.current = null;
      const url = new URL(window.location.href);
      url.searchParams.delete('publication');
      url.searchParams.delete('tab');
      window.history.replaceState({}, '', url);
      const id = matches.find(Boolean);
      if (!id) {
        setError('このWebブックに対応する人物を、現在の家族一覧で見つけられませんでした。');
        return;
      }
      setSelectedId(id);
      setActiveTab('books');
      setScreen('person');
    }).catch(() => {
      if (live) setError('本棚を開けませんでした。もう一度お試しください。');
    });
    return () => { live = false; };
  }, [familyId, people, screen]);
  useEffect(() => {
    const warn = event => {
      if (!pendingAudioRef.current && textRef.current === savedTextRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    revokeFamilyPlaceMediaUrls(mediaRef.current);
  }, []);

  const replaceMedia = items => {
    revokeFamilyPlaceMediaUrls(mediaRef.current);
    mediaRef.current = items;
    setMedia(items);
  };

  const openPerson = id => {
    personLoadEpoch.current++;
    setError(''); setSelectedId(id); setActiveTab('ring');
    setPublishedBooks([]); setBooksStatus('loading'); setScreen('person');
  };
  const goHome = async () => {
    if (screen === 'recording' && guardRef.current) {
      guardRef.current(() => { setScreen('story'); });
      return;
    }
    if (activeStory && (textRef.current !== savedTextRef.current || savePromiseRef.current)) {
      try { await flushText(); } catch { setError('保存できていません。再試行してください'); return; }
    }
    replaceMedia([]);
    setActiveStory(null); setSelectedId(null); setScreen('home');
    if (user) await loadHome(user);
  };
  const leaveStory = async () => {
    clearTimeout(saveTimer.current);
    if (textRef.current !== savedTextRef.current || savePromiseRef.current) {
      try { await flushText(); }
      catch { setError('保存できていません。再試行してください'); return; }
    }
    replaceMedia([]);
    setScreen('person');
    if (person) await loadPerson(person.id);
  };
  const openTree = () => {
    setTreeCenterId(current => current && people.some(item => item.id === current)
      ? current : selfId || people[0]?.id || null);
    setScreen('tree'); setError('');
  };
  const startAddPerson = (anchorId = null, relation = '') => {
    setNewPerson({ ...emptyPersonDraft(), gender: relation === 'father' ? 'male'
      : relation === 'mother' ? 'female' : '' });
    setNewPersonAnchorId(anchorId);
    setNewPersonRelation(relation === 'self' ? '' : relation);
    setNewIsSelf(relation === 'self');
    setScreen('add-person'); setError('');
  };
  const linkExisting = async otherId => {
    setBusy(true); setError('');
    try {
      await saveFamilyPlaceRelation(supabaseClient,familyId,newPersonAnchorId || selfId,
        otherId,newPersonRelation);
      await loadHome(user);
      setScreen(newPersonAnchorId ? 'tree' : 'home');
    } catch (cause) { setError(cause.message || '関係を保存できませんでした'); }
    finally { setBusy(false); }
  };
  const editRelation = async (id, anchorId, otherId, role) => {
    setBusy(true); setError('');
    try { await saveFamilyPlaceRelation(supabaseClient,familyId,anchorId,otherId,role,id);
      await loadHome(user); return true;
    } catch (cause) { setError(cause.message || '関係を変更できませんでした'); return false; }
    finally { setBusy(false); }
  };
  const unlinkRelation = async id => {
    setBusy(true); setError('');
    try { await removeFamilyPlaceRelation(supabaseClient,id);
      await loadHome(user); return true;
    } catch (cause) { setError(cause.message || '関係を解除できませんでした'); return false; }
    finally { setBusy(false); }
  };
  const createPerson = async event => {
    event.preventDefault();
    if (!familyId || !(newPerson.family_name.trim() || newPerson.given_name.trim())) return;
    setBusy(true); setError('');
    try {
      const id = await addFamilyPlacePerson(supabaseClient, familyId, newPerson, newIsSelf,
        newPersonRelation ? newPersonAnchorId || selfId : null, newPersonRelation || null);
      await loadHome(user);
      setNewPerson(emptyPersonDraft()); setNewIsSelf(false); setNewPersonRelation('');
      if (newPersonAnchorId) { setTreeCenterId(newPersonAnchorId); setScreen('tree'); }
      else openPerson(id);
    } catch (cause) { setError(cause.message || '登録できませんでした'); }
    finally { setBusy(false); }
  };
  const startProfile = () => {
    setProfilePhotoFile(null); setProfilePhotoPreview(null);
    setProfile({ ...personNameParts(person), birth_year: person.birth_year || '',
      birth_month: person.birth_month || '', birth_day: person.birth_day || '',
      death_year: person.death_year || '', maiden_name: person.maiden_name || '',
      notes: person.notes || '', gender: person.gender || '' });
    setScreen('profile');
  };
  const saveProfile = async event => {
    event.preventDefault(); setBusy(true); setError('');
    let newPortraitPath = null;
    try {
      if (profilePhotoFile) newPortraitPath = await uploadFamilyPlacePortrait(
        supabaseClient, user.id, person.id, profilePhotoFile);
      await updateFamilyPlacePerson(supabaseClient, person.id, profile,
        newPortraitPath || undefined);
      await loadHome(user);
      setProfilePhotoFile(null); setProfilePhotoPreview(null);
      setScreen('person');
    } catch (cause) {
      if (newPortraitPath) await supabaseClient.storage.from('family-person-portraits')
        .remove([newPortraitPath]).catch(() => {});
      setError(cause.message || '保存できませんでした');
    }
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
      // Only new stories use this default; opening an existing story keeps
      // its stored visibility, including a previously set private key.
      const visibility = 'family';
      const row = await getOrCreateFamilyPlaceStory(supabaseClient, user.id, person, question, visibility);
      const items = await familyPlaceMedia(supabaseClient, row.id);
      storyRef.current = row; setActiveStory(row); setStoryQuestion(question);
      textRef.current = row.body || ''; savedTextRef.current = row.body || '';
      setBody(row.body || ''); replaceMedia(items); setSaveState('saved');
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
    replaceMedia(refreshed); setSaveState('saved');
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
    {screen !== 'home' && screen !== 'person' && screen !== 'tree' && <header className="fp-header">
      <button onClick={() => screen === 'story' ? leaveStory()
          : screen === 'profile' ? setScreen('person')
          : screen === 'add-person' && newPersonAnchorId ? setScreen('tree')
          : screen === 'person' ? goHome() : setScreen('home')}><ChevronLeft/>戻る</button>
      <span>{person?.display_name || '家族の場所'}</span>
    </header>}
    {error && <p className="fp-error" role="alert">{error}</p>}
    {screen === 'home' && <FamilyHome people={people} storyCounts={homeStoryCounts}
      onAddPerson={() => startAddPerson()} onOpenPerson={openPerson} onTree={openTree}/>}
    {screen === 'tree' && <FamilyTree people={people} relations={relations} selfId={selfId}
      centerId={treeCenterId || selfId || people[0]?.id} onCenter={setTreeCenterId}
      onAdd={startAddPerson} onOpenPerson={openPerson} onHome={goHome}
      onEditRelation={editRelation} onRemoveRelation={unlinkRelation}/>}
    {screen === 'add-person' && <main className="fp-section"><h1>家族を登録する</h1>
      <form onSubmit={createPerson} className="fp-form">
        <label>どなたを登録しますか？<select value={newIsSelf ? 'self' : 'family'}
          onChange={event => { setNewIsSelf(event.target.value === 'self');
            if (event.target.value === 'self') setNewPersonRelation(''); }}>
          <option value="family">家族</option><option value="self" disabled={Boolean(selfId)}>自分</option>
        </select></label>
        {!newIsSelf && selfId && !newPersonAnchorId && <label>自分との関係（任意）<select
          value={newPersonRelation} onChange={event => {
            const relation = event.target.value;
            setNewPersonRelation(relation);
            if (relation === 'father' || relation === 'mother') setNewPerson(current => ({
              ...current, gender: relation === 'father' ? 'male' : 'female',
            }));
          }}>
          <option value="">その他・未設定</option><option value="father">父</option>
          <option value="mother">母</option><option value="spouse">配偶者</option>
          <option value="child">子</option>
        </select></label>}
        {newPersonAnchorId && <p className="fp-note">{people.find(item => item.id===newPersonAnchorId)?.display_name}さんの
          {({father:'父',mother:'母',spouse:'配偶者',child:'子ども'})[newPersonRelation]}として追加します。</p>}
        <div className="fp-name-fields">
          <label>姓<input maxLength={100} required={!newPerson.given_name.trim()} autoComplete="family-name" value={newPerson.family_name}
            onChange={event => setNewPerson({...newPerson,family_name:event.target.value})}/></label>
          <label>名<input maxLength={100} required={!newPerson.family_name.trim()} autoComplete="given-name" value={newPerson.given_name}
            onChange={event => setNewPerson({...newPerson,given_name:event.target.value})}/></label>
        </div>
        <BirthDateFields value={newPerson} onChange={setNewPerson}/>
        <label>性別（任意）<select value={newPerson.gender || ''}
          disabled={newPersonRelation === 'father' || newPersonRelation === 'mother'}
          onChange={event => setNewPerson({...newPerson,gender:event.target.value})}>
          <option value="">未登録</option><option value="female">女性</option><option value="male">男性</option>
        </select></label>
        <p className="fp-note">詳しいプロフィールは後から追加できます。</p>
        <button className="fp-primary" disabled={busy}>{newPersonAnchorId ? '登録して家系図を見る' : '登録して人物ページを見る'}</button>
      </form>
      {newPersonRelation && (newPersonAnchorId || selfId) && people.some(item => item.id !== (newPersonAnchorId || selfId)) &&
        <section className="fp-existing-link"><h2>すでに登録済みですか？</h2>
          <p className="fp-note">同じ人物を作り直さず、関係だけを追加できます。</p>
          {people.filter(item => item.id !== (newPersonAnchorId || selfId)).map(item =>
            <button type="button" disabled={busy} key={item.id} onClick={() => linkExisting(item.id)}>
              {item.display_name}さんと結ぶ</button>)}
        </section>}
    </main>}
    {screen === 'person' && person && <FamilyPersonPage person={person} stories={stories}
      supabaseClient={supabaseClient}
      books={publishedBooks} booksStatus={booksStatus} onRetryBooks={() => loadPerson(person.id)}
      facts={familyPlaceTimeline(person,facts)} questions={testQuestions} activeTab={activeTab}
      onTabChange={setActiveTab} onBack={goHome} onProfile={startProfile}
      onOpenStory={openStory} busy={busy}
      onAddFact={() => {setFactDraft({fact_type:'education',label:'',event_year:'',event_month:'',event_day:'',detail:''});setScreen('profile');}}/>}
    {screen === 'profile' && person && <main className="fp-section"><h1>プロフィール</h1>
      <form className="fp-form" onSubmit={saveProfile}>
        <label className="fp-profile-photo">プロフィール画像（任意）
          <span className="fp-profile-photo-picker">
            {(profilePhotoPreview || person.portrait_url) ? <img
              src={profilePhotoPreview || person.portrait_url} alt="選択中のプロフィール画像"/>
              : <span className="fp-profile-photo-empty" aria-hidden="true">写真</span>}
            <span>写真を選ぶ</span>
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0] || null;
              setProfilePhotoFile(file);
              setProfilePhotoPreview(file ? URL.createObjectURL(file) : null);
            }}/>
          <small>JPEG・PNG・WebP、5MBまで</small>
        </label>
        <div className="fp-name-fields">
          <label>姓<input maxLength={100} required={!profile?.given_name?.trim()} autoComplete="family-name" value={profile?.family_name || ''}
            onChange={event => setProfile({...profile,family_name:event.target.value})}/></label>
          <label>名<input maxLength={100} required={!profile?.family_name?.trim()} autoComplete="given-name" value={profile?.given_name || ''}
            onChange={event => setProfile({...profile,given_name:event.target.value})}/></label>
        </div>
        <label>旧姓（任意）<input value={profile?.maiden_name || ''}
          onChange={event => setProfile({...profile,maiden_name:event.target.value})}/></label>
        <BirthDateFields value={profile || emptyPersonDraft()} onChange={setProfile}/>
        <label>没年（分かる場合）<YearSelect value={profile?.death_year} onChange={next =>
          setProfile({...profile,death_year:next})}/></label>
        <label>紹介（任意）<textarea value={profile?.notes || ''}
          onChange={event => setProfile({...profile,notes:event.target.value})}/></label>
        <label>性別（任意）<select value={profile?.gender || ''}
          onChange={event => setProfile({...profile,gender:event.target.value})}>
          <option value="">未登録</option><option value="female">女性</option><option value="male">男性</option>
        </select></label>
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
        <EventDateFields value={factDraft} onChange={setFactDraft}/>
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
    {screen === 'home' ? <FamilyHomeNav onHome={goHome} onStories={goHome} onFamily={openTree}/> : screen === 'person' ? null : <nav className="fp-bottom">
      <button onClick={goHome}><Home/>ホーム</button>
      <button onClick={() => {setScreen('home');setSelectedId(null);}}><BookOpen/>人生の物語</button>
      <button onClick={openTree}><Users/>家族</button>
      <button disabled><Image/>思い出</button>
    </nav>}
  </div>;
}
