export const CHILDHOOD_TRIAL_QUESTIONS = [
  { id: 'TY_TRIAL_CHILDHOOD01', content: '幼い頃、どんなところに住んでいましたか？', hint: '地名や地域の雰囲気、家のことなど、思い出せることから教えてください。' },
  { id: 'TY_TRIAL_CHILDHOOD02', content: 'その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？', hint: '母、父、祖父母、きょうだい、友達、先生など。' },
  { id: 'TY_TRIAL_CHILDHOOD03', content: 'その頃、どんな遊びが好きでしたか？', hint: '一人で夢中になったことでも、誰かと遊んだことでも。どんなふうに遊んでいたか、聞かせてください。' }
];

export function isChildhoodTrial(questions) {
  return CHILDHOOD_TRIAL_QUESTIONS.every(({id}) => questions?.some(question =>
    (question.question_id || question.id) === id && question.onboarding_group === 'trial_experience'));
}
