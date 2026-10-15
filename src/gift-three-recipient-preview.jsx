import React from 'react';
import { createRoot } from 'react-dom/client';
import GiftThreeCompletionExperience from './GiftThreeCompletionExperience.jsx';

const stories = [
  { id: 'sample-1', title: '川の音が聞こえる家', question: '幼い頃、どんな場所で暮らしていましたか？',
    text: '小さな川のそばの家で暮らしていました。夕方になると、台所の窓から家族を呼ぶ声が聞こえてきたことを覚えています。',
    state: 'ready', audio: [], photos: [] },
  { id: 'sample-2', title: '遊びに誘ってくれた友達', question: '子どもの頃、よく一緒に過ごした人は誰ですか？',
    text: '近所の友達が、いつも外へ誘いに来てくれました。遊ぶ場所を決めずに歩き出した時間が、今も懐かしいです。',
    state: 'ready', audio: [], photos: [] },
  { id: 'sample-3', title: '外遊びと、雨の日の絵', question: '小さい頃、夢中になったことは何ですか？',
    text: '晴れた日は外を走り回り、雨の日は家で絵を描いていました。母がその絵を大切にしまってくれていたことも思い出します。',
    state: 'ready', audio: [], photos: [] },
];

const previewEmailRegistered = new URLSearchParams(location.search).get('email') !== 'none';
createRoot(document.getElementById('gift-three-recipient-preview-root')).render(
  <GiftThreeCompletionExperience stories={stories} loading={false} error="" preview
    previewEmailRegistered={previewEmailRegistered} />,
);
