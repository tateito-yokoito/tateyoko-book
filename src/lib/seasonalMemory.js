export const SEASON_NAMES = ['冬', '春', '夏', '秋'];
const SEASON_MONTHS = [1, 4, 7, 10];
const jstParts = date => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
};

export function seasonalBoxes(now = new Date()) {
  const { year, month, day } = jstParts(now);
  const index = Math.floor((month - 1) / 3);
  const currentStart = `${year}-${String(SEASON_MONTHS[index]).padStart(2, '0')}-01`;
  const previousIndex = (index + 3) % 4;
  const previousYear = index === 0 ? year - 1 : year;
  const previousStart = `${previousYear}-${String(SEASON_MONTHS[previousIndex]).padStart(2, '0')}-01`;
  // The grace period is the entire first month of the new quarter.
  const inGrace = month === SEASON_MONTHS[index];
  const graceDays = inGrace
    ? new Date(Date.UTC(year, month, 0)).getUTCDate() - day : 0;
  return {
    current: { start: currentStart, year, name: SEASON_NAMES[index],
      months: `${SEASON_MONTHS[index]}月〜${SEASON_MONTHS[index] + 2}月` },
    previous: inGrace ? { start: previousStart, year: previousYear,
      name: SEASON_NAMES[previousIndex],
      months: `${SEASON_MONTHS[previousIndex]}月〜${SEASON_MONTHS[previousIndex] + 2}月`,
      graceDays } : null,
  };
}

export const hasSeasonalContent = (record, media = []) =>
  Boolean(record?.body?.trim() || record?.transcript_raw?.trim() || media.length);

export async function loadSeasonalMemories(client, projectId) {
  const { data: records, error } = await client.from('seasonal_memory_records')
    .select('*').eq('book_project_id', projectId).neq('status', 'expired')
    .order('season_start', { ascending: false });
  if (error) throw error;
  const ids = (records || []).map(record => record.id);
  if (!ids.length) return { records: [], media: [] };
  const { data: media, error: mediaError } = await client.from('seasonal_memory_media')
    .select('*').in('record_id', ids).order('sort_order', { ascending: true });
  if (mediaError) throw mediaError;
  return { records: records || [], media: media || [] };
}

export async function invokeSeasonal(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export function seasonalSaveArgs(record, fields) {
  return {
    input_record_id: record.id, input_expected_revision: record.revision,
    input_title: fields.title ?? record.title ?? '',
    input_body: fields.body ?? record.body ?? '',
    input_transcript_raw: fields.transcript_raw ?? record.transcript_raw ?? '',
    input_transcript_clean: fields.transcript_clean ?? record.transcript_clean ?? '',
    input_transcript_readable: fields.transcript_readable ?? record.transcript_readable ?? '',
    input_transcript_essay: fields.transcript_essay ?? record.transcript_essay ?? '',
    input_tone: fields.tone ?? record.tone ?? 'readable',
    input_event_period: fields.event_period ?? record.event_period ?? null,
  };
}
