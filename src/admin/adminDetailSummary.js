export const jpDate = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })
  : '記録なし';

export const yen = value => value == null || !Number.isFinite(Number(value))
  ? '金額未記録'
  : `${new Intl.NumberFormat('ja-JP').format(Number(value))}円`;

export function latestProjectOrder(orders, projectId, purchaserId = null) {
  return (orders || [])
    .filter(order => order.book_project_id === projectId && (!purchaserId || order.purchaser_user_id === purchaserId))
    .sort((a, b) => Date.parse(b.purchased_at || b.created_at || 0) - Date.parse(a.purchased_at || a.created_at || 0))[0] || null;
}

export function projectProgress(detail) {
  const answers = detail?.answers || [];
  const questions = detail?.preview?.questions || [];
  const questionBySequence = new Map(questions.map(question => [Number(question.sequence_order), question]));
  const trialAnswers = answers.filter(answer => {
    const question = questionBySequence.get(Number(answer.sequence_order));
    return question && /体験の一頁|無料体験/.test(`${question.chapter || ''} ${question.chapter_label || ''}`);
  });
  const knownAnswerCount = answers.filter(answer => questionBySequence.has(Number(answer.sequence_order))).length;
  const mainCount = Math.max(0, knownAnswerCount - trialAnswers.length);
  const latestMain = answers
    .filter(answer => {
      const question = questionBySequence.get(Number(answer.sequence_order));
      return question && !/体験の一頁|無料体験/.test(`${question.chapter || ''} ${question.chapter_label || ''}`);
    })
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
  const latestQuestion = latestMain && questionBySequence.get(Number(latestMain.sequence_order));
  const lastAnswer = answers.map(answer => answer.created_at).filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return {
    trial: trialAnswers.length ? `${Math.min(trialAnswers.length, 3)} / 3問 回答済み` : '回答記録なし・対象外の可能性あり',
    mainPlace: latestQuestion?.chapter_label || latestQuestion?.chapter || '本編の語りは未記録',
    mainCount: questions.length ? `語り ${mainCount} / 27（標準質問の目安）` : '語りの内訳を確認できません',
    lastAnswer: jpDate(lastAnswer)
  };
}
