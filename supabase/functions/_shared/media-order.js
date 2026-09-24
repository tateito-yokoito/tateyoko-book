// Capture creation time is authoritative; legacy rows fall back to part order.
// Array.sort is stable when both values are unavailable/equal.
export function compareMediaChronologically(a, b) {
  const first=Date.parse(a.created_at),second=Date.parse(b.created_at);
  if(Number.isFinite(first)&&Number.isFinite(second)&&first!==second)return first-second;
  const part=value=>Number(value)>0?Number(value):Number.MAX_SAFE_INTEGER;
  return part(a.meta_json?.part)-part(b.meta_json?.part);
}
