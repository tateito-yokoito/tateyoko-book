export const LINE_PROVIDER = "custom:line";

const REGISTRATION_KEY = "tateyoko:line-registration";
const REGISTRATION_MAX_AGE_MS = 15 * 60 * 1000;
const NOTIFICATION_RETURN_KEY = "tateyoko:line-notification-return";

export function buildLineExternalBrowserUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname === "liff.line.me" || url.hostname.endsWith(".liff.line.me")) {
    throw new Error("LINE通知にはHTTPSの通常ページURLが必要です");
  }
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

export function saveLineRegistrationDraft(storage, names, now = Date.now()) {
  const familyName = String(names.familyName || "").trim();
  const givenName = String(names.givenName || "").trim();
  if (!familyName || !givenName) throw new Error("お名前を入力してください");
  storage.setItem(REGISTRATION_KEY, JSON.stringify({ familyName, givenName, createdAt: now }));
}

export function takeLineRegistrationDraft(storage, now = Date.now()) {
  const raw = storage.getItem(REGISTRATION_KEY);
  storage.removeItem(REGISTRATION_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (!Number.isFinite(draft.createdAt) || now - draft.createdAt > REGISTRATION_MAX_AGE_MS || now < draft.createdAt) return null;
    if (!draft.familyName || !draft.givenName) return null;
    return {
      familyName: draft.familyName,
      givenName: draft.givenName,
      fullName: `${draft.familyName} ${draft.givenName}`,
      preferredName: `${draft.givenName}さん`
    };
  } catch {
    return null;
  }
}

export function hasLineIdentity(user) {
  return Boolean(user?.identities?.some(identity => identity.provider === LINE_PROVIDER));
}

export function completePlaceholderLineProfile(profile, registrationData) {
  const familyName = String(registrationData?.familyName || "").trim();
  const givenName = String(registrationData?.givenName || "").trim();
  if (!familyName || !givenName || profile?.family_name || profile?.given_name) return {};
  const isPlaceholder = value => !value || value === "あなた";
  if (![profile?.name, profile?.display_name, profile?.preferred_name].every(isPlaceholder)) return {};
  const fullName = `${familyName} ${givenName}`;
  return {
    family_name: familyName,
    given_name: givenName,
    name: fullName,
    display_name: fullName,
    preferred_name: `${givenName}さん`
  };
}

export function markLineNotificationReturn(storage, now = Date.now()) {
  storage.setItem(NOTIFICATION_RETURN_KEY, String(now));
}

export function takeLineNotificationReturn(storage, now = Date.now()) {
  const raw = storage.getItem(NOTIFICATION_RETURN_KEY);
  storage.removeItem(NOTIFICATION_RETURN_KEY);
  const timestamp = Number(raw);
  return Boolean(raw && Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= REGISTRATION_MAX_AGE_MS);
}

export async function startLineSignIn(client, redirectTo) {
  return client.auth.signInWithOAuth({
    provider: LINE_PROVIDER,
    options: { redirectTo, queryParams: { bot_prompt: "normal" } }
  });
}

export async function linkLineToCurrentAccount(client, redirectTo) {
  return client.auth.linkIdentity({
    provider: LINE_PROVIDER,
    options: { redirectTo, queryParams: { bot_prompt: "normal" } }
  });
}
