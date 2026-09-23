// Future print generators can use this after get_book_print_handoff(order_id).
// It deliberately produces data only: no PDF, print job, or printer API call.
export function resolveBookPrintHandoff(record, appUrl) {
  if (record?.schema_version !== 1 || !/^[a-f0-9]{48}$/.test(String(record.public_id || ''))
    || !['true', 'false'].includes(String(record.qr_in_book))) {
    throw new Error('Invalid completed-book handoff');
  }
  const origin = new URL(appUrl);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new Error('Invalid Web book origin');
  }
  const url = new URL(`/?voice=${record.public_id}`, origin).toString();
  return {
    ...record,
    web_book_url: url,
    qr_url: record.qr_in_book ? url : null,
    standard_qr_placements: record.qr_in_book ? ['after-title', 'back-cover'] : [],
    premium_qr_placements: record.qr_in_book ? ['after-title'] : []
  };
}
