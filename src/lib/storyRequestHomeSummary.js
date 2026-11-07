const nameKey = value => String(value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('ja');

export function storyRequestHomeSummary(requests = []) {
  let unviewedCount = 0;
  let includedCount = 0;
  const contributors = new Set();
  for (const request of requests) {
    const answers = request.theme_memory_answer_records || [];
    if (!request.owner_viewed_at || (request.submitted_at && request.submitted_at > request.owner_viewed_at)) {
      unviewedCount += answers.filter(answer => answer.publication_status === 'unreviewed').length;
    }
    for (const answer of answers) {
      if (answer.publication_status !== 'included') continue;
      includedCount += 1;
      const name = nameKey(answer.responder_name || request.recipient_name);
      if (name) contributors.add(name);
    }
  }
  return { unviewedCount, includedCount, contributorCount: contributors.size };
}
