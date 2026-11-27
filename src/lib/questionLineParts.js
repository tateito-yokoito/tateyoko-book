const wordSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

// A Japanese predicate and its inflection must stay on the same line.
// Keep the wording unchanged; add only reading-unit break opportunities.
export function questionLineParts(value) {
  const text = String(value || '');
  const lines = text.split('\n');
  return lines.flatMap((line, lineIndex) => {
    const firstPause = line.indexOf('、');
    const clauses = firstPause > 0 && firstPause <= 8 && line.length - firstPause > 8
      ? [line.slice(0, firstPause + 1), line.slice(firstPause + 1)] : [line];
    return clauses.flatMap((clause, clauseIndex) => {
      const parts = [];
      // Put the break before the final predicate, after the final case
      // particle. For example: どんなところに / 住んでいましたか？
      const predicateBoundaries = [...clause.matchAll(/[にでをがはとへも](?=[一-龯々])/gu)];
      const predicateStart = predicateBoundaries.at(-1)?.index + 1;
      const tailText = predicateStart && clause.length - predicateStart <= 12
        ? clause.slice(predicateStart) : '';
      const head = tailText ? clause.slice(0, -tailText.length) : clause;
      if (wordSegmenter) {
        for (const { segment, isWordLike } of wordSegmenter.segment(head)) {
          parts.push({ text: segment, keep: isWordLike });
        }
      } else parts.push({ text: head, keep: false });
      if (tailText) parts.push({ text: tailText, keep: true });
      if (clauseIndex < clauses.length - 1) parts.push({ break: true });
      return parts;
    }).concat(lineIndex < lines.length - 1 ? [{ break: true }] : []);
  });
}
