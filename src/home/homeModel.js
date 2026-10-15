// Presentation state only. Never grants access or determines refund/production rights.
export function getHomePhase({ hasReadableWork = false, finishingRequested = false, storyCount = 0 } = {}) {
  if (hasReadableWork) return 'complete';
  if (finishingRequested) return 'finishing';
  return storyCount > 0 ? 'growing' : 'beginning';
}

export const HOME_COPY = {
  greeting: '今日も、少しだけ。',
  beginning: { description: 'あの頃の景色を、\nもう少し辿ってみる。', action: '次の問いへ' },
  growing: { description: '思い出すたび、\nつながっていく日々。', action: '次の問いへ' },
  finishing: { eyebrow: '一冊に、結晶化する', title: '大切なものを選び、\n一冊へ。', description: '残してきた言葉と写真から、\n今のあなたが届けたいものを。', action: 'ブックを仕上げる' },
  complete: { eyebrow: 'いつでも、ここへ', title: 'ここに還れば、\nまた逢える。', description: '残した言葉と声が、\nあなたと家族を待っています。', action: 'わたしの本棚をひらく' },
};
