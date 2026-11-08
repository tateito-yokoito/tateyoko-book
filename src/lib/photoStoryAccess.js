import { canProduce, createFamilyApi } from './familyConnection.js';

// The photo picker and recording/review screens are shared. Only the
// project-scoped persistence path differs for a family-managed story.
export async function photoStoryAccess(client, projectId) {
  if (!projectId) throw Error('物語を確認できませんでした。');
  const { data: managed, error } = await client.rpc('family_managed', { p: projectId });
  if (error) throw error;
  if (!managed) return { kind: 'personal' };

  const api = createFamilyApi(client, { allowProduction: true });
  const workspace = await api.workspace(projectId);
  if (workspace.project_id !== projectId || !canProduce(workspace)) {
    throw Error('この物語の制作権限を確認できませんでした。');
  }
  return { kind: 'family', api, workspace };
}
