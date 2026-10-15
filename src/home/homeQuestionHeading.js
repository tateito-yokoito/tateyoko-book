// Match the question actually opened at currentIndex, not the next main theme.
export function homeQuestionHeading(questionSet = [], currentIndex = 0, themeProgress = null) {
  const question = questionSet[currentIndex];
  const introductions = {
    starting_motivation: ['はじめに', '門出の声（任意）'],
    starting_conversation: ['はじめに', 'はじめの会話'],
    voice_intro: ['はじめに', '物語の入口'],
    life_outline: ['はじめに', '人生の輪郭'],
    trial_experience: ['無料３問', '体験の一頁'],
  };
  const introduction = introductions[question?.onboarding_group];
  if (introduction) return { eyebrow: introduction[0], title: introduction[1] };
  if (!themeProgress?.currentTheme) return null;
  return { eyebrow: `テーマ${themeProgress.currentTheme.order}`, title: themeProgress.currentTheme.label };
}
