import { STORY_THEMES } from './storyThemes.js';

export function getThemeResumeContext(questionSet, currentIndex = 0) {
  const storyQuestions = (questionSet || [])
    .map((question, questionIndex) => ({ question, questionIndex }))
    .filter(({ question }) =>
      question?.include_in_story_list !== false &&
      Number.isInteger(Number(question?.theme_order)) &&
      Number(question.theme_order) > 0
    );

  if (storyQuestions.length === 0) return null;

  const indexedCurrentQuestion = storyQuestions.find(
    ({ questionIndex }) => questionIndex === currentIndex
  );
  const resumeQuestion = indexedCurrentQuestion &&
    !['answered', 'skipped'].includes(indexedCurrentQuestion.question?.status)
    ? indexedCurrentQuestion
    : storyQuestions.find(({ question }) => !['answered', 'skipped'].includes(question?.status));

  if (!resumeQuestion) return null;

  const themeOrder = Number(resumeQuestion.question.theme_order);
  const questionsInTheme = storyQuestions.filter(
    ({ question }) => Number(question.theme_order) === themeOrder
  );
  const questionNumber = questionsInTheme.findIndex(
    ({ questionIndex }) => questionIndex === resumeQuestion.questionIndex
  ) + 1;
  const theme = STORY_THEMES.find(item => item.order === themeOrder) || {
    label:
      resumeQuestion.question?.theme_label ||
      resumeQuestion.question?.chapter_label ||
      '物語',
    order: themeOrder,
    summary: resumeQuestion.question?.chapter_description || '',
    opening: '',
    hint: resumeQuestion.question?.prompt_hint || '',
    visual: 'childhood'
  };

  return {
    theme,
    questionIndex: resumeQuestion.questionIndex,
    questionNumber: Math.max(questionNumber, 1)
  };
}
