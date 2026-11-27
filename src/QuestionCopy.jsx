import React from 'react';
import { questionLineParts } from './lib/questionLineParts.js';
import './question-copy.css';

export function QuestionCopy({ text }) {
  return <>{questionLineParts(text).map((part, index) => part.break
    ? <br key={index} />
    : part.keep ? <span className="question-copy-unit" key={index}>{part.text}</span>
      : <React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}

export function questionGuidance(question, { bookend = false } = {}) {
  const dailyLife = /最近は[、,]?\s*どんなふうに.*一日を過ごす/.test(question?.content || '');
  const lines = bookend ? ['短くても大丈夫です。'] : dailyLife
    ? ['いつもの一日から、よくしていることを一つ。', '特別な出来事でなくても大丈夫です。']
    : [question?.prompt_hint || question?.hint, question?.reassurance_text];
  return lines.filter(Boolean).filter((line, index, all) => all.indexOf(line) === index);
}
