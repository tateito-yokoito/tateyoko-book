// Fictional review data, never mixed with an authenticated person's library.
const familyPhoto = { src: '/site/standard-softcover-family-logo-corrected.png', crop: { left: '-44.35%', top: '-87.48%', width: '184.68%' } };
const landscape = { src: '/site/theme-now-future.jpg' };
const familyMemory = { src: '/site/theme-family-memory-triptych.jpg' };
const childhood = { src: '/site/theme-childhood-triptych.jpg', crop: { left: '0%', top: '-47.8%', width: '307.2%' } };
export const DEMO_BOOKS = {
  makoto2020: { id: 'makoto-2020', personId: 'makoto', title: '紡木 誠', subtitle: '45年目の現在地', publishedAt: '2020-08-01', color: '#b9c4a5', photo: familyPhoto },
  makoto2030: { id: 'makoto-2030', personId: 'makoto', title: '独立を記念して', subtitle: '人生の振り返り', publishedAt: '2030-03-01', color: '#ede0cb', photo: landscape },
  makoto2036: { id: 'makoto-2036', personId: 'makoto', title: '家族4人の歩み', subtitle: '子供たちの旅立ちを祝して', publishedAt: '2036-04-01', color: '#b8d3e2', photo: familyPhoto },
  yumi1: { id: 'yumi-1', personId: 'yumi', title: '宝物を授かった幸せ', subtitle: 'ママになるまでのこと', publishedAt: '2005-05-01', color: '#e8dcc8', photo: childhood },
  yumi2: { id: 'yumi-2', personId: 'yumi', title: '娘が生まれた時のこと', subtitle: '', publishedAt: '2008-04-01', color: '#e4bdbb', photo: childhood },
  daisuke1: { id: 'daisuke-1', personId: 'daisuke', title: 'はじめての海外一人旅', subtitle: '自分の足で、歩いた日々', publishedAt: '2028-08-01', color: '#bdd6e2', photo: landscape },
  daisuke2: { id: 'daisuke-2', personId: 'daisuke', title: '新しい道へ', subtitle: 'これからのわたし', publishedAt: '2031-04-01', color: '#b6c8d2', photo: landscape },
  chie1: { id: 'chie-1', personId: 'chie', title: 'わたしの20歳', subtitle: '大切にしたいこと', publishedAt: '2030-04-01', color: '#e8c9c7', photo: familyMemory },
  kenichi1: { id: 'kenichi-1', personId: 'kenichi', title: '残されたもの', subtitle: '家族へ伝えたいこと', publishedAt: '2022-10-01', color: '#e4dccd', photo: landscape },
};
export const DEMO_OWN_BOOKS = [DEMO_BOOKS.makoto2020, DEMO_BOOKS.makoto2030, DEMO_BOOKS.makoto2036];
export const DEMO_FAMILY_PEOPLE = [
  { id: 'makoto', name: '紡木 誠', note: '仕事、家族、これからも', books: DEMO_OWN_BOOKS },
  { id: 'yumi', name: '紡木 由美', note: 'ずっと、ありがとう', books: [DEMO_BOOKS.yumi1, DEMO_BOOKS.yumi2] },
  { id: 'daisuke', name: '紡木 大輔', note: '自分らしく、歩いていく', books: [DEMO_BOOKS.daisuke1, DEMO_BOOKS.daisuke2] },
  { id: 'chie', name: '紡木 千恵', note: '好きなことで、生きていきたい', books: [DEMO_BOOKS.chie1] },
  { id: 'kenichi', name: '紡木 健一', note: 'あの時代のこと', books: [DEMO_BOOKS.kenichi1] },
];
