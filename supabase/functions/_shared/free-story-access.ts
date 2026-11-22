import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role lookups are deliberately scoped to the authenticated caller.
// Free stories have no BOOK project or purchase entitlement.
export async function editableFreeStory(
  serviceClient: SupabaseClient,
  authClient: SupabaseClient,
  storyId: string,
) {
  const { data: allowed, error: permissionError } = await authClient
    .rpc("family_free_story_can_write", { input_story_id: storyId });
  if (permissionError) throw permissionError;
  if (allowed !== true) throw new Error("Forbidden");
  const { data: story, error } = await serviceClient.from("family_free_stories")
    .select("id,family_id,person_id,created_by,question_text")
    .eq("id", storyId).maybeSingle();
  if (error) throw error;
  if (!story) throw new Error("Forbidden");
  return story;
}

export async function assertFreeStoryAudioPaths(
  client: SupabaseClient,
  storyId: string,
  paths: string[],
) {
  const buckets: string[] = [];
  for (const path of paths) {
    const { data, error } = await client.from("family_free_story_media")
      .select("id,storage_bucket").eq("story_id", storyId)
      .eq("asset_type", "audio").eq("storage_path", path).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Forbidden");
    if (!['audio', 'family-free-media'].includes(data.storage_bucket)) throw new Error("Forbidden");
    buckets.push(data.storage_bucket);
  }
  return buckets;
}
