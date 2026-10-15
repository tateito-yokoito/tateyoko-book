import {familyJourney} from './familyHomeModel.js';

// Browser-local presentation preference, never an authentication/permission flag.
const fallback = new Map();
const key = (userId, personId) => `ty-first-story-v1:${userId}:${personId}`;
export function firstStoryGuideState(userId, personId) {
  if (!userId || !personId) return 'pending';
  const id = key(userId, personId);
  try {return localStorage.getItem(id) || fallback.get(id) || 'pending';}
  catch {return fallback.get(id) || 'pending';}
}
export function finishFirstStoryGuide(userId, personId, state = 'done') {
  if (!userId || !personId || !['done', 'dismissed'].includes(state)) return;
  const id = key(userId, personId);
  fallback.set(id, state);
  try {localStorage.setItem(id, state);} catch {/* Keep this visit usable. */}
}
export function firstStoryDestination(workspace) {
  const journey = familyJourney(workspace);
  // Never start a paid period or main experience on behalf of the subject.
  if (['startingConsent', 'mainConsent'].includes(journey.stage)) return {scene: journey.stage};
  if (['purchase', 'inactive'].includes(journey.stage)) return {scene: 'home'};
  const question = journey.pool.find(q => q.available && !q.answered);
  return question ? {scene: 'record', questionId: question.id} : {scene: 'home'};
}
