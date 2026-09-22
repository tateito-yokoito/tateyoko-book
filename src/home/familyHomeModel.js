import {STORY_THEMES} from '../lib/storyThemes.js';
import {BOOK_MILESTONES_ENABLED} from '../lib/bookMilestones.js';

// Presentation only: the API remains authoritative for question availability.
export function familyJourney(workspace) {
  const questions = workspace.questions || [], access = workspace.access || {};
  const trial = questions.filter(q => q.group === 'trial_experience');
  const starting = questions.filter(q => ['starting_conversation','life_outline','starting_motivation'].includes(q.group) || (q.sequence_order <= 4 && q.group !== 'trial_experience'));
  const main = questions.filter(q => q.theme_code && q.group !== 'trial_experience' && !starting.includes(q));
  let stage = 'trial', pool = trial;
  if (access.refunded || (access.paid && !access.can_create && access.production_started_at)) stage = 'inactive';
  else if (access.main_started_at) {stage = 'main'; pool = main;
    if(BOOK_MILESTONES_ENABLED && main.length && main.every(q=>q.answered || q.skipped))pool=questions.filter(q=>q.group==='closing_reflection');
  }
  else if (access.paid && !access.production_started_at) {stage = 'startingConsent'; pool = starting;}
  else if (access.paid) {
    pool = starting;
    stage = ['chapter_complete','theme_intro','completed'].includes(workspace.ritual_step) ? 'mainConsent' : 'starting';
  } else if (trial.length && trial.every(q => q.answered === true)) stage = 'purchase';
  const next = pool.find(q => q.available && !q.answered && !q.skipped) || (stage === 'main' ? null : pool.find(q => q.available && !q.skipped)) || null;
  const theme = next?.group==='closing_reflection' ? {label:'おわりの章',order:null,opening:'ここまで人生を辿ってきました。'} : STORY_THEMES.find(t => t.code === next?.theme_code) || STORY_THEMES[0];
  const sameTheme = stage === 'main' ? main.filter(q => q.theme_code === theme.code) : pool;
  const isStarting = ['starting','startingConsent','mainConsent'].includes(stage);
  return {stage, next, pool, main, starting, model: {
    phase: 'beginning', storyCount: workspace.answers?.length || 0,
    theme: {label: isStarting ? 'はじまりの章' : theme.label, order: isStarting ? null : theme.order,
      total: sameTheme.length, answered: sameTheme.filter(q => q.answered).length},
    copy: {description: isStarting ? 'これから残したいことを、\nあなたの言葉で。' : theme.opening || 'あの頃の景色を、\nもう少し辿ってみる。',
      action: stage === 'purchase' ? '続きを残す' : stage === 'startingConsent' ? 'はじまりの章へ' : stage === 'mainConsent' ? '本編へ進む' : '次の問いへ'},
  }};
}
