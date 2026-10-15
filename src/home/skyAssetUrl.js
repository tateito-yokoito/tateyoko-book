export function skyAssetUrl(client, src) {
  if (!src) return '';
  if (!src.startsWith('/storage/v1/object/public/daily-skies/')) return src;
  return `${String(client?.supabaseUrl || '').replace(/\/$/, '')}${src}`;
}
