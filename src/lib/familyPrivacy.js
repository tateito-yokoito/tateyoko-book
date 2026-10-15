// Existing privacy UI uses sequence_order for display only. Resolve each answer
// by user_question UUID; actor-local answer sequence numbers are not question IDs.
export function createFamilyPrivacyAccess(api, projectId) {
  const load = async () => {
    const workspace = await api.workspace(projectId);
    if (workspace?.project_id !== projectId || !canProduce(workspace)) {
      throw Error('Subject workspace required');
    }
    const questions = new Map((workspace.questions || []).map(q => [q.id, q]));
    return (workspace.answers || []).map(answer => ({
      id: answer.id,
      user_question_id: answer.question_id,
      sequence_order: questions.get(answer.question_id)?.sequence_order,
      transcript_edited: answer.text || '',
      // Unexpected/missing visibility is private, never permission to share.
      access_override: answer.private === false ? 'inherit' : 'private_forever',
      created_at: answer.created_at,
    }));
  };
  return {
    list: load,
    async setPrivate(answerId, isPrivate) {
      if (typeof isPrivate !== 'boolean') throw Error('Invalid visibility');
      const rows = await load();
      if (!rows.some(row => row.id === answerId)) throw Error('Answer outside workspace');
      // RPC independently enforces subject rights. No user_id/owner_id update.
      await api.share(answerId, !isPrivate);
      return load();
    },
  };
}
import {canProduce} from './familyConnection.js';
