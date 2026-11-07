export function nextThemeQuestion(questions, completedThemeOrder) {
  const nextOrder = Number(completedThemeOrder) + 1;
  const index = questions.findIndex(question =>
    Number(question?.theme_order) === nextOrder
    && question?.question_role !== 'theme_extra'
    && !['answered', 'skipped'].includes(question?.status)
  );
  return index < 0 ? null : { index, sequenceOrder: questions[index].sequence_order };
}
