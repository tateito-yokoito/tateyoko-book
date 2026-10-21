import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLineExternalBrowserUrl,
  completePlaceholderLineProfile,
  hasLineIdentity,
  LINE_PROVIDER,
  linkLineToCurrentAccount,
  markLineNotificationReturn,
  saveLineRegistrationDraft,
  startLineSignIn,
  takeLineNotificationReturn,
  takeLineRegistrationDraft
} from "../../src/lib/lineAuth.js";

test("LINE question links request the external browser without dropping the token", () => {
  const href = buildLineExternalBrowserUrl("https://www.tateito-yokoito.jp/?token=abc123&journey_link=xyz");
  const url = new URL(href);
  assert.equal(url.searchParams.get("token"), "abc123");
  assert.equal(url.searchParams.get("journey_link"), "xyz");
  assert.equal(url.searchParams.get("openExternalBrowser"), "1");
  assert.throws(() => buildLineExternalBrowserUrl("https://liff.line.me/123"));
  assert.throws(() => buildLineExternalBrowserUrl("http://example.com/"));
});

test("existing user's LINE notification setup return is short-lived and one-time", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  markLineNotificationReturn(storage, 1000);
  assert.equal(takeLineNotificationReturn(storage, 2000), true);
  assert.equal(takeLineNotificationReturn(storage, 3000), false);
  markLineNotificationReturn(storage, 1000);
  assert.equal(takeLineNotificationReturn(storage, 1000 + 16 * 60 * 1000), false);
});

test("LINE registration draft is short-lived and consumed once", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  saveLineRegistrationDraft(storage, { familyName: "菅原", givenName: "花子" }, 1000);
  assert.deepEqual(takeLineRegistrationDraft(storage, 2000), {
    familyName: "菅原", givenName: "花子", fullName: "菅原 花子", preferredName: "花子さん"
  });
  assert.equal(takeLineRegistrationDraft(storage, 3000), null);
  saveLineRegistrationDraft(storage, { familyName: "菅原", givenName: "花子" }, 1000);
  assert.equal(takeLineRegistrationDraft(storage, 1000 + 16 * 60 * 1000), null);
});

test("a LINE registration can finish a placeholder profile without replacing an established name", () => {
  const draft = { familyName: "菅原", givenName: "花子" };
  assert.deepEqual(completePlaceholderLineProfile({ name: "あなた", display_name: "あなた", preferred_name: "あなた", family_name: null, given_name: null }, draft), {
    family_name: "菅原", given_name: "花子", name: "菅原 花子", display_name: "菅原 花子", preferred_name: "花子さん"
  });
  assert.deepEqual(completePlaceholderLineProfile({ name: "登録済みの名前", family_name: null, given_name: null }, draft), {});
  assert.deepEqual(completePlaceholderLineProfile({ name: "あなた", family_name: "既存", given_name: "利用者" }, draft), {});
  assert.deepEqual(completePlaceholderLineProfile({ name: "あなた", family_name: null, given_name: null }, {}), {});
});

test("LINE sign-in uses the configured custom provider and preserves the return URL", async () => {
  let options;
  const client = { auth: { signInWithOAuth: async input => { options = input; return { data: {} }; } } };
  const redirectTo = "https://www.tateito-yokoito.jp/?app=1&token=opaque";
  await startLineSignIn(client, redirectTo);
  assert.deepEqual(options, { provider: LINE_PROVIDER, options: { redirectTo, queryParams: { bot_prompt: "normal" } } });
  assert.equal(hasLineIdentity({ identities: [{ provider: LINE_PROVIDER }] }), true);
  assert.equal(hasLineIdentity({ identities: [{ provider: "email" }] }), false);
});

test("existing accounts use identity linking, not a second sign-in", async () => {
  let options;
  const client = { auth: { linkIdentity: async input => { options = input; return { data: {} }; } } };
  await linkLineToCurrentAccount(client, "https://www.tateito-yokoito.jp/?app=1");
  assert.deepEqual(options, {
    provider: LINE_PROVIDER,
    options: { redirectTo: "https://www.tateito-yokoito.jp/?app=1", queryParams: { bot_prompt: "normal" } }
  });
});
