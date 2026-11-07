import { requireFamilyProjectAccess } from "./family-access.ts";
export async function requireExperienceProcessing(admin: any, projectId: string, actorId: string, answerId = "") {
  if (!projectId) throw new Error("bookProjectId is required");
  // Never let a supplied active project mask an existing answer from a stopped project.
  if (/^[0-9a-f-]{36}$/i.test(answerId)) {
    const {data: answer,error} = await admin.from("answers").select("book_project_id").eq("id",answerId).maybeSingle();
    if (error) throw error;
    if (answer && answer.book_project_id !== projectId) throw new Error("Forbidden");
  }
  if (await requireFamilyProjectAccess(admin, projectId, actorId, "process", answerId)) {
    const {data, error} = await admin.rpc("experience_data_allowed", {input_project_id: projectId, input_write: true});
    if (error || data !== true) throw new Error("Production access suspended");
    return;
  }
  const {error} = await admin.rpc("assert_experience_processing",{input_project_id:projectId,input_actor_id:actorId});
  if (error) throw new Error(error.message);
}
