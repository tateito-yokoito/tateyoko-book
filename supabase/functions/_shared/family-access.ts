import {requireFamilyRelease} from './family-release.ts';
/** Run before any legacy owner/payer shortcut in a service-role endpoint.
 * false = ordinary project; true = authorized Person-bound subject.
 * Missing migration / RPC errors fail closed; never silently fall back.
 */
export async function requireFamilyProjectAccess(admin: any, projectId: string, actorId: string, operation = "manage", answerId = "") {
  await requireFamilyRelease(admin,projectId,actorId);
  const { data, error } = await admin.rpc("family_assert_operation", {
    p: projectId, u: actorId, operation, answer: answerId || null,
  });
  if (error) throw new Error("Family authorization unavailable or forbidden");
  return data === true;
}

export async function requireFamilyAssetAccess(admin: any, bucket: string, path: string, actorId: string, projectId: string) {
  await requireFamilyRelease(admin,projectId,actorId);
  const {data, error} = await admin.rpc("family_assert_asset", {bucket, object_path: path, actor: actorId, project: projectId});
  if (error) throw new Error("Forbidden asset");
  return data === true;
}

// Only a caller's newly uploaded parts, never a capability to read the subject's
// other recordings or private vocabulary/context. The legacy path is unchanged.
export async function familyPendingVoiceScope(admin: any, body: any, actorId: string) {
  if (body.familyUploadIds === undefined) return null;
  const ids = body.familyUploadIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 ||
      ids.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) ||
      new Set(ids).size !== ids.length || body.answerId !== ids[0]) throw new Error("Forbidden");
  if(!await requireFamilyRelease(admin,body.bookProjectId,actorId))throw Error('Family project required');
  const {data, error} = await admin.rpc("family_pending_voice_scope", {
    p: body.bookProjectId, actor: actorId, uploads: ids,
  });
  if (error || !Array.isArray(data?.paths) || data.paths.length !== ids.length) throw new Error("Forbidden");
  return data as {paths: string[]; subject: boolean};
}
