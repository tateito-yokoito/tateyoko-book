export async function logActivity(supabaseClient, payload) {
  try {
    const {
      actorUserId,
      action,
      entityType = null,
      entityId = null,
      familyId = null,
      bookProjectId = null,
      answerId = null,
      metadata = {},
    } = payload || {};

    if (!actorUserId || !action) return;

    const { error } = await supabaseClient
      .from("activity_logs")
      .insert({
        actor_user_id: actorUserId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        family_id: familyId,
        book_project_id: bookProjectId,
        answer_id: answerId,
        metadata,
        user_agent: navigator.userAgent,
      });

    if (error) {
      console.warn("activity log insert error", error);
    }
  } catch (error) {
    console.warn("activity log unexpected error", error);
  }
}
