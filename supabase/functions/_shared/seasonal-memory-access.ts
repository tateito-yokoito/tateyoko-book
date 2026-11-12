// Reuse the existing speech processors while keeping seasonal media outside
// immutable BOOK answers. User-scoped RPC establishes authorization first;
// service-role reads below only resolve the already authorized record.
export async function editableSeasonalMemory(
  userClient: any,
  serviceClient: any,
  recordId: string,
  projectId = "",
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) {
    throw new Error("Forbidden");
  }
  const { data: allowed, error: accessError } = await userClient.rpc(
    "seasonal_memory_open", { input_record_id: recordId },
  );
  if (accessError || allowed !== true) throw new Error("Forbidden");
  const { data: record, error } = await serviceClient.from("seasonal_memory_records")
    .select("id,book_project_id,question_text,status").eq("id", recordId).single();
  if (error || !record || record.status !== "draft"
    || (projectId && record.book_project_id !== projectId)) throw new Error("Forbidden");
  return record;
}

export async function assertSeasonalAudioPaths(
  serviceClient: any,
  recordId: string,
  paths: string[],
) {
  if (!paths.length) return;
  const { data, error } = await serviceClient.from("seasonal_memory_media")
    .select("storage_path").eq("record_id", recordId).eq("kind", "audio")
    .in("storage_path", paths);
  if (error || data?.length !== new Set(paths).size
    || paths.length !== new Set(paths).size) throw new Error("Forbidden audio path");
}
