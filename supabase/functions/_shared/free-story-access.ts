import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role lookups are deliberately scoped to the authenticated caller.
// Free stories have no BOOK project or purchase entitlement.
export async function editableFreeStory(
  client: SupabaseClient,
  storyId: string,
  userId: string,
) {
  const { data: story, error } = await client.from("family_free_stories")
    .select("id,family_id,person_id,created_by,question_text")
    .eq("id", storyId).maybeSingle();
  if (error) throw error;
  if (!story || story.created_by !== userId) throw new Error("Forbidden");
  const { data: family, error: familyError } = await client.from("families")
    .select("id").eq("id", story.family_id).eq("owner_user_id", userId).maybeSingle();
  if (familyError) throw familyError;
  const { data: person, error: personError } = await client.from("persons")
    .select("id").eq("id", story.person_id).eq("family_id", story.family_id).maybeSingle();
  if (personError) throw personError;
  if (!family || !person) throw new Error("Forbidden");
  return story;
}

export async function assertFreeStoryAudioPaths(
  client: SupabaseClient,
  storyId: string,
  paths: string[],
) {
  for (const path of paths) {
    const { data, error } = await client.from("family_free_story_media")
      .select("id").eq("story_id", storyId)
      .eq("asset_type", "audio").eq("storage_path", path).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Forbidden");
  }
}
