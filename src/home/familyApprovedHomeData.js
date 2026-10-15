import {STORY_THEMES} from '../lib/storyThemes.js';

// Keep the family workspace as the source of truth for the shared home UI.
export function familyApprovedHomeData(workspace, journey) {
  const questionSet = (workspace.questions || []).map(question => ({
    ...question,
    onboarding_group: question.group,
    status: question.answered ? 'answered' : question.skipped ? 'skipped' : 'pending',
  }));
  const currentIndex = Math.max(0, questionSet.findIndex(question => question.id === journey.next?.id));
  const currentTheme = STORY_THEMES.find(theme => theme.code === journey.next?.theme_code);
  return {
    questionSet,
    currentIndex,
    themeProgress: journey.stage === 'main' && currentTheme ? {currentTheme} : null,
  };
}
