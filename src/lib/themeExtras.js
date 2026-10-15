import { STORY_THEMES } from './storyThemes.js';
import { publishedCopyFor } from './questionCopy.js';

// These are optional prompts. The ordinary 2–3 questions in each theme remain the
// short, complete path; selecting an extra never makes it mandatory to answer.
export const THEME_EXTRA_QUESTIONS = {
  ty_theme_childhood: [
    ['childhood-food', '幼い頃、楽しみにしていたおやつや食べ物はありますか？'],
    ['childhood-season', '夏休みやお正月など、季節の行事で覚えていることはありますか？'],
    ['childhood-treasure', '子どもの頃、大切にしていたものは何でしたか？'],
    ['childhood-senses', '思い出すと幼い頃に戻るような、音や匂いはありますか？']
  ],
  ty_theme_youth: [
    ['youth-dream', '学生時代、どんな夢を持っていましたか？'],
    ['youth-after-school', '放課後や休みの日は、どのように過ごしていましたか？'],
    ['youth-first-challenge', '若い頃、初めて挑戦したことを一つ教えてください。']
  ],
  ty_theme_likes: [
    ['likes-music', '思い出と結びついている曲や音楽はありますか？'],
    ['likes-food', '何度でも食べたい、忘れられない味はありますか？'],
    ['likes-making', '自分で作ったり、集めたりして楽しかったものはありますか？']
  ],
  ty_theme_living: [
    ['living-journey', '特に思い出深い旅を一つ教えてください。'],
    ['living-table', 'いつもの食卓で、今も覚えている場面はありますか？'],
    ['living-pet', '一緒に暮らした動物との思い出はありますか？']
  ],
  ty_theme_work: [
    ['work-beginning', '最初の仕事や役割を始めた頃のことを覚えていますか？'],
    ['work-person', '仕事や役割の中で、忘れられない人はいますか？'],
    ['work-change', '仕事や役割が変わったとき、どんな気持ちでしたか？']
  ],
  ty_theme_connections: [
    ['connections-meeting', '大切な人と初めて出会ったときのことを覚えていますか？'],
    ['connections-words', '誰かから言われて、今も覚えている言葉はありますか？'],
    ['connections-reunion', '久しぶりに再会して、うれしかった人はいますか？']
  ],
  ty_theme_family: [
    ['family-saying', '家族や身近な人の口癖で、今も覚えているものはありますか？'],
    ['family-celebration', '家族や身近な人と過ごした行事で、覚えている場面はありますか？'],
    ['family-person', '今、語っておきたい身近な人との思い出はありますか？']
  ],
  ty_theme_turning_points: [
    ['turning-choice', 'あのとき選んでよかったと思うことはありますか？'],
    ['turning-support', '変化の時期に、そばにいてくれた人はいますか？'],
    ['turning-unexpected', '思いがけない出来事から始まったことはありますか？']
  ],
  ty_theme_now_future: [
    ['future-day', '今、好きな一日の過ごし方を教えてください。'],
    ['future-meeting', 'これから会いたい人や、行ってみたい場所はありますか？'],
    ['future-self', 'これからの自分に、どんな言葉をかけたいですか？']
  ]
};

export function themeExtraOptions(themeCode, questions = []) {
  const used = new Set(questions.filter(question => question?.meta_json?.theme_extra_id || question?.theme_extra_id)
    .map(question => question.meta_json?.theme_extra_id || question.theme_extra_id));
  const theme = STORY_THEMES.find(item => item.code === themeCode);
  if (!theme) return [];
  const freeId = `free-${themeCode.replaceAll('_', '-')}`;
  const options = (THEME_EXTRA_QUESTIONS[themeCode] || [])
    .filter(([id]) => !used.has(id))
    .map(([id, text]) => ({ id, text: publishedCopyFor(`extra:${id}`)?.text || text, kind: 'extra' }));
  if (!used.has(freeId)) options.push({ id: freeId, kind: 'free', text: publishedCopyFor(`extra:${freeId}`)?.text || `「${theme.label}」について気ままに語る` });
  return options;
}
