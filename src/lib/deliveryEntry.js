// Resolve the recipient before loading or creating any account-specific data.
// A valid link for another account requires verification, not an invalid-link error.
export async function resolveDeliveryEntry({ token, session, resolveToken }) {
  if (!token) return { kind: "none", tokenData: null };
  try {
    const tokenData = await resolveToken(token);
    if (!tokenData?.user_id) return { kind: "invalid", tokenData: null };
    return {
      kind: session?.user?.id === tokenData.user_id ? "resume" : "authenticate",
      accountMismatch: Boolean(session?.user?.id && session.user.id !== tokenData.user_id),
      tokenData
    };
  } catch {
    return { kind: "unavailable", tokenData: null };
  }
}

export function withoutDeliveryToken(href) {
  const url = new URL(href);
  url.searchParams.delete("token");
  url.searchParams.set("entry", "login");
  return url.toString();
}
