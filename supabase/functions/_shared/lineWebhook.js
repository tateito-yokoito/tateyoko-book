// Verify the exact bytes before parsing. Never log webhook bodies or secrets.
export async function verifyLineSignature(bytes, signature, secret) {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature || '')) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
    const decoded = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, decoded, bytes);
  } catch { return false; }
}

// Ignore message text, reply tokens, and profile data. No inferred consent.
export function lineFriendshipEvents(body) {
  if (!Array.isArray(body?.events)) throw new Error('Invalid events');
  return body.events.flatMap(event => {
    if (!['follow','unfollow'].includes(event?.type) || event?.source?.type !== 'user' ||
        !/^U[0-9a-f]{32}$/.test(event.source.userId || '') ||
        !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) return [];
    return [{lineUserId:event.source.userId,status:event.type === 'follow' ? 'active' : 'blocked',timestamp:event.timestamp}];
  }).sort((a,b) => a.timestamp-b.timestamp);
}
