import { STORY_THEMES } from './storyThemes.js';
import {compareMediaChronologically} from '../../supabase/functions/_shared/media-order.js';

export const finishedText = a => a.transcript_edited || (a.selected_style === 'essay' ? a.transcript_essay : a.selected_style === 'clean' ? a.transcript_clean : a.transcript_readable) || a.transcript_readable || a.transcript_clean || a.transcript_raw || '';

// Use question identity, never array position (optional/unselected answers leave gaps).
export function questionIdentity(q = {}) {
  return { questionId: q.question_id || '', themeCode: q.meta_json?.theme_code || q.theme_code || '',
    slot: q.meta_json?.video_slot_key || '', group: q.meta_json?.onboarding_group || '' };
}

export function snapshotToWebBook(snapshot = {}) {
  const unique = rows => [...new Map(rows.map(row => [row.id,row])).values()];
  snapshot = {...snapshot, ...Object.fromEntries(['answers','questions','media'].map(key => [key,unique([...(snapshot[key]||[]),...(snapshot.web_intro?.[key]||[])])]))};
  const questions = new Map((snapshot.questions || []).map(q => [q.id, q]));
  const items = (snapshot.answers || []).map((a, index) => {
    const q = questions.get(a.user_question_id) || {};
    const media = (snapshot.media || []).filter(m => m.answer_id === a.id);
    return { order: index + 1, sourceSequenceOrder: a.sequence_order ?? q.sequence_order, sourceAnswerId: a.id, mainFormat: a.meta_json?.main_response_format || 'audio', ...questionIdentity(q),
      chapterTitle: q.chapter_title_snapshot || q.chapter || '',
      question: q.custom_question_text || q.question_text_snapshot || '', transcript: finishedText(a),
      audio: media.filter(m => m.asset_type === 'audio').sort(compareMediaChronologically).map((m, assetIndex) => ({ assetIndex, videoId: m.meta_json?.video_id, url: m.url, durationSeconds: m.meta_json?.duration_seconds })),
      photos: media.filter(m => m.asset_type === 'photo').map((m, assetIndex) => ({ assetIndex, url: m.url, caption: m.meta_json?.caption || '' })) };
  });
  const videos = (snapshot.videos || []).filter(v => v.video_storage_path || v.url).map((v, videoIndex) => ({
    videoIndex, sourceAnswerId: v.source_answer_id, slot: v.metadata?.milestone_key,
    title: v.title, prompt: v.prompt_text, transcript: v.transcript_text, url: v.url,
    durationSeconds: v.duration_seconds, brightnessPercent: v.metadata?.brightness_percent || 0
  }));
  return { title: snapshot.cover?.title || snapshot.project?.title || '', subtitle: snapshot.cover?.subtitle || '',
    subjectName: snapshot.subject?.display_name || snapshot.subject?.preferred_name || '',
    footerText: snapshot.cover?.footer_text || '', coverUrl: snapshot.cover?.url || '',
    coverTransform: snapshot.cover?.cover_photo_transform, items, videos };
}

// The only book-level ordering definition. Reading, listening, navigation and the
// final-page decision all consume these entries; assetIndex remains untouched.
export function webBookStorySequence(publication) {
  const sections = webBookSections(publication);
  const sequence = [];
  const ordered = rows => [...rows].sort((a,b) => (a.sourceSequenceOrder ?? a.order ?? 0) - (b.sourceSequenceOrder ?? b.order ?? 0));
  const add = (item,kind,chapterKey,chapterLabel,theme=null,video=null) => {
    if(!item)return;
    sequence.push({id: String(item.sourceAnswerId || item.questionId || `item-${item.order}`),kind,item,
      title:item.question || item.chapterTitle || chapterLabel,chapterKey,chapterLabel,theme,
      audio:item.audio || [],video:video || sections.videoFor(item)});
  };
  add(sections.opening,'starting','opening','はじまりの声');
  if(!sections.opening)for(const v of sections.unassignedVideos.filter(v=>v.slot==='opening'))add({order:`video-${v.videoIndex}`,question:v.prompt||v.title||'はじまりの声',audio:[],transcript:v.transcript},'starting','opening','はじまりの声',null,v);
  sections.now.forEach(item=>add(item,'current_self','now','今の私'));
  sections.themes.forEach(theme=>ordered(theme.items).forEach(item=>add(item,'theme_story',theme.code,`${String(theme.order).padStart(2,'0')}　${theme.label}`,theme)));
  // Unclassified legacy stories remain readable in their saved order.
  ordered(sections.other).forEach(item=>add(item,'theme_story','legacy','残された語り'));
  sections.unassignedVideos.filter(v=>!['opening','closing'].includes(v.slot)).forEach(v=>add({order:`video-${v.videoIndex}`,question:v.prompt||v.title||'映像',audio:[],transcript:v.transcript},'theme_story','legacy','残された語り',null,v));
  add(sections.closing,'ending','closing','おわりの章');
  if(!sections.closing)for(const v of sections.unassignedVideos.filter(v=>v.slot==='closing'))add({order:`video-${v.videoIndex}`,question:v.prompt||v.title||'おわりの声',audio:[],transcript:v.transcript},'ending','closing','おわりの章',null,v);
  return sequence.map((entry,index)=>({...entry,previousId:sequence[index-1]?.id||null,nextId:sequence[index+1]?.id||null,isLast:index===sequence.length-1}));
}

// A filtered view, never a separately sorted list. Videos with an already-saved
// audio track participate via item.audio; video-only entries stay reading-only.
export const webBookAudioSequence = sequence => sequence.filter(entry=>entry.audio.length>0);

export function webBookSections(publication) {
  const items = (publication.items || []).filter(i => i.transcript || i.audio?.length || i.photos?.length || (publication.videos || []).some(v => v.sourceAnswerId && v.sourceAnswerId === i.sourceAnswerId));
  const byId = id => items.find(i => i.questionId === id);
  const opening = byId('TY_ONB04') || items.find(i => i.slot === 'opening');
  const closing = byId('TY_CLOSING01') || items.find(i => i.slot === 'closing');
  const special = new Set([byId('TY_ONB01'), byId('TY_ONB02'), byId('TY_ONB03'), opening, closing].filter(Boolean));
  const remaining = items.filter(i => !special.has(i));
  const themes = STORY_THEMES.map(t => ({ ...t, items: remaining.filter(i => i.themeCode === t.code || (!i.themeCode && [t.label, t.order === 1 ? '幼い頃' : ''].filter(Boolean).includes(i.chapterTitle))) })).filter(t => t.items.length);
  const grouped = new Set(themes.flatMap(t => t.items));
  return { name: byId('TY_ONB01'), now: [byId('TY_ONB02'), byId('TY_ONB03')], opening, closing, themes,
    // Legacy publications without identity must remain accessible, not guessed into a theme.
    other: remaining.filter(i => !grouped.has(i)),
    videoFor: item => (publication.videos || []).find(v => (item?.sourceAnswerId && v.sourceAnswerId === item.sourceAnswerId) || (item?.slot && v.slot === item.slot)),
    unassignedVideos: (publication.videos || []).filter(v => !items.some(i => (i.sourceAnswerId && v.sourceAnswerId === i.sourceAnswerId) || (i.slot && v.slot === i.slot))) };
}
