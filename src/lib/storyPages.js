import { CHILDHOOD_TRIAL_QUESTIONS } from './childhoodTrial.js';

export const isTrialStoryQuestion = question => question?.onboarding_group === 'trial_experience';
export const isChildhoodTrialStory = question => isTrialStoryQuestion(question)
  && CHILDHOOD_TRIAL_QUESTIONS.some(({ id }) => id === (question.question_id || question.id));

const chapterTitleOf = question => question?.chapter_label || question?.chapter_description || question?.chapter || 'その他';

export function isVisibleStoryQuestion(question) {
  if (isTrialStoryQuestion(question)) return question.status === 'answered';
  return question?.include_in_story_list !== false || question?.onboarding_group === 'starting_conversation';
}

export const countAnsweredStories = questions => (questions || []).filter(
  question => question.status === 'answered' && isVisibleStoryQuestion(question)
).length;

export function questionForStory(answer, questions = []) {
  const candidates = questions.filter(question => !answer.book_project_id || !question.book_project_id
    || question.book_project_id === answer.book_project_id);
  const id = answer.user_question_id || answer.meta_json?.user_question_id;
  // An explicit association must never fall back to another question's sequence.
  if (id) return candidates.find(question => question.user_question_id === id) || null;
  const matches = candidates.filter(question => question.sequence_order != null && answer.sequence_order != null
    && Number(question.sequence_order) === Number(answer.sequence_order));
  return matches.length === 1 ? matches[0] : null;
}

export function buildStorySections(questions = [], answers = []) {
  const sections = [];
  const childhoodQuestion = questions.find(question => !isTrialStoryQuestion(question)
    && question.theme_code === 'ty_theme_childhood');
  const childhoodTitle = childhoodQuestion ? chapterTitleOf(childhoodQuestion) : '幼い頃';
  const sectionFor = question => {
    // Only the three known childhood prompts belong here. The older trial prompts
    // span different life stages and must not be silently reclassified.
    const isChildhood = isChildhoodTrialStory(question);
    const isTrial = isTrialStoryQuestion(question) && !isChildhood;
    const chapterTitle = isTrial ? '無料体験の語り'
      : isChildhood ? childhoodTitle : chapterTitleOf(question);
    const key = isTrial ? 'free-trial' : `chapter:${chapterTitle}`;
    let section = sections.find(item => item.key === key);
    if (!section) {
      section = { key, chapterTitle, isTrial, answers: [] };
      sections.push(section);
    }
    return section;
  };
  questions.filter(isVisibleStoryQuestion).forEach(sectionFor);
  for (const answer of answers) {
    const question = questionForStory(answer, questions);
    if (isVisibleStoryQuestion(question)) sectionFor(question).answers.push(answer);
  }
  // Legacy trials remain separate; current trials share the existing childhood tab.
  return sections.filter(section => !section.isTrial || section.answers.length)
    .sort((a, b) => Number(a.isTrial) - Number(b.isTrial));
}
