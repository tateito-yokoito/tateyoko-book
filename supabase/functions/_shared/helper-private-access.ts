// Service-role endpoints must repeat the helper's data boundary: RLS does not
// apply to their reads. Use the same DB role predicate as Storage and RPCs.
export async function isStoryHelper(admin: any, projectId: string, actorId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("book_role_is_helper", {
    input_project_id: projectId, input_actor_id: actorId
  });
  if (error) throw new Error("Forbidden");
  return data === true;
}

export async function assertHelperAnswerVisible(
  admin: any, projectId: string, actorId: string, answerId: string, allowMissing = false
): Promise<void> {
  if (!await isStoryHelper(admin, projectId, actorId)) return;
  const { data, error } = await admin.from("answers")
    .select("book_project_id,access_override").eq("id", answerId).maybeSingle();
  if (error || (!data && !allowMissing) || (data && data.book_project_id !== projectId)
    || data?.access_override === "private_forever") throw new Error("Forbidden");
}

export async function assertHelperMediaPathsVisible(
  admin: any, projectId: string, actorId: string, paths: string[]
): Promise<void> {
  if (!paths.length || !await isStoryHelper(admin, projectId, actorId)) return;
  const { data, error } = await admin.from("media_assets")
    .select("book_project_id,answer_id,storage_path")
    .in("storage_path", paths);
  if (error) throw new Error("Forbidden");
  for (const media of data || []) {
    if (media.book_project_id !== projectId || !media.answer_id) throw new Error("Forbidden");
    await assertHelperAnswerVisible(admin, projectId, actorId, media.answer_id);
  }
  // Archived recordings may no longer have a media_assets row. The service
  // role can still download them, so check their answer provenance as well.
  const { data: archived, error: archiveError } = await admin.from("answer_audio_archive")
    .select("answer_id,storage_path").in("storage_path", paths);
  if (archiveError) throw new Error("Forbidden");
  for (const item of archived || []) {
    await assertHelperAnswerVisible(admin, projectId, actorId, item.answer_id);
  }
}
