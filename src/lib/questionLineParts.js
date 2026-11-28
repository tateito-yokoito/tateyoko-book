const wordSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

function sentenceParts(sentence) {
  // Short follow-up questions should stay together whenever they fit.
  if (sentence.length <= 12 && /[。！？!?]$/u.test(sentence)) {
    return [{ text: sentence, phrase: true }];
  }

  // Keep a short object and the instruction that follows it as separate
  // reading units: …人を / 一人思い浮かべてください。
  const countedInstruction = sentence.match(/^(.{1,16}を)([一二三四五六七八九十\d]+[人つ個].{1,11})$/u);
  if (countedInstruction) {
    return countedInstruction.slice(1).map(text => ({ text, phrase: true }));
  }

  const predicateBoundaries = [...sentence.matchAll(/[にでをがはとへも](?=[一-龯々])/gu)];
  const predicateStart = predicateBoundaries.at(-1)?.index + 1;
  const tail = predicateStart && sentence.length - predicateStart <= 12
    ? sentence.slice(predicateStart) : '';
  const head = tail ? sentence.slice(0, predicateStart) : sentence;
  const parts = wordSegmenter
    ? Array.from(wordSegmenter.segment(head), ({ segment, isWordLike }) => ({ text: segment, keep: isWordLike }))
    : [{ text: head }];
  if (tail) parts.push({ text: tail, keep: true });
  return parts;
}

export function questionLineParts(value) {
  return String(value || '').split('\n').flatMap((line, index) => [
    ...(index ? [{ break: true }] : []),
    ...line.split(/(?<=[。！？!?])(?![。！？!?])/u).flatMap(sentenceParts),
  ]);
}
