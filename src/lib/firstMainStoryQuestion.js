export function getFirstMainStoryIndex(questionSet) {
  const questions = questionSet || [];
  const themedStoryIndex = questions.findIndex(question =>
    question?.flow_type === "story" &&
    Number.isFinite(Number(question?.theme_order)) &&
    Number(question.theme_order) > 0 &&
    question?.question_role !== "theme_extra"
  );
  if (themedStoryIndex >= 0) return themedStoryIndex;

  const explicitIndex = questions.findIndex(question =>
    question?.question_role === "first_weekly_question" ||
    question?.question_role === "first_story"
  );
  if (explicitIndex >= 0) return explicitIndex;

  return questions.findIndex(question =>
    question?.flow_type === "story" &&
    question?.include_in_story_list !== false
  );
}
