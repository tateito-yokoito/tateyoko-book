// Adapt the permission-filtered family RPC to the existing supporter reader.
// Never infer access from payer / historical owner / actor_user_id.
export async function loadFamilySharedStories(api, projectId) {
  const workspace = await api.workspace(projectId);
  if (workspace?.project_id !== projectId || workspace.role !== 'supporter') {
    throw Error('Unsupported story workspace');
  }
  const questions = new Map((workspace.questions || []).map((q, index) => [q.id, {
    ...q, sequence_order: index + 1, content: q.text,
    chapter_label: q.chapter_label || '',
  }]));
  const storyRows = [];
  const mediaByAnswerId = {};
  for (const answer of workspace.answers || []) {
    // The server already enforces visibility. Fail closed on unexpected rows too.
    if (answer.private !== false) continue;
    const question = questions.get(answer.question_id);
    storyRows.push({id: answer.id, transcript_edited: answer.text || '',
      sequence_order: question?.sequence_order ?? questions.size + 1});
    const photos = (answer.media || []).filter(item => item.kind === 'photo');
    mediaByAnswerId[answer.id] = await Promise.all(photos.map(async item => ({
      id: item.path, asset_type: 'photo', url: await api.mediaUrl('photo', item.path),
    })));
  }
  return {project: {subject_name: workspace.name}, questionSet: [...questions.values()],
    storyRows, mediaByAnswerId};
}
