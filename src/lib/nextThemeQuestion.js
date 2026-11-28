export function nextThemeQuestion(questions, completedThemeOrder) {
  const completedOrder = Number(completedThemeOrder);
  const nextOrder = Math.min(...questions
    .filter(question =>
      Number(question?.theme_order) > completedOrder
      && question?.question_role !== 'theme_extra'
      && !['answered', 'skipped'].includes(question?.status))
    .map(question => Number(question.theme_order)));
  if (!Number.isFinite(nextOrder)) return null;
  const index = questions.findIndex(question =>
    Number(question?.theme_order) === nextOrder
    && question?.question_role !== 'theme_extra'
    && !['answered', 'skipped'].includes(question?.status)
  );
  return index < 0 ? null : { index, sequenceOrder: questions[index].sequence_order };
}
