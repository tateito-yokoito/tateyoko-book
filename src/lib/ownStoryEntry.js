// Project creation and question allocation do not mean that the account owner
// intentionally started telling their own story. Those can be legacy side
// effects of signing in as somebody else's supporter.
export function ownProjectHasStarted(project, hasSavedAnswer = false) {
  return ["paid", "gifted", "legacy"].includes(project?.access_status) ||
    hasSavedAnswer;
}

export function ownStoryEntryUrl(locationLike, entry) {
  if (entry !== "trial" && entry !== "purchase") {
    throw new Error("Unknown own-story entry");
  }
  const url = new URL(locationLike.pathname, locationLike.origin);
  url.searchParams.set("app", "1");
  url.searchParams.set("entry", entry);
  return url.toString();
}
