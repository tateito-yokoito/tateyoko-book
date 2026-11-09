import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ga4SummaryRequest, parseGa4Summary } from '../../supabase/functions/_shared/ga4-summary.js';

test('GA4 requests distinct period totals and source sessions without purchase data', () => {
  const requests = ga4SummaryRequest().requests;
  assert.equal(requests.length, 4);
  assert.deepEqual(requests[2].dateRanges, [{ startDate: '6daysAgo', endDate: 'today' }]);
  assert.deepEqual(requests[2].metrics.map(metric => metric.name), ['totalUsers', 'screenPageViews']);
  assert.deepEqual(requests[3].metrics.map(metric => metric.name), ['sessions']);
  assert.equal(requests[3].dimensions[0].name, 'sessionSourceMedium');
});

test('GA4 response keeps seven-day distinct users and source sessions separate', () => {
  const totals = (users, views) => ({ metricHeaders: [{ name: 'totalUsers' }, { name: 'screenPageViews' }],
    rows: [{ metricValues: [{ value: String(users) }, { value: String(views) }] }] });
  const result = parseGa4Summary({ reports: [totals(2, 3), totals(3, 4), totals(4, 7), {
    dimensionHeaders: [{ name: 'sessionSourceMedium' }], metricHeaders: [{ name: 'sessions' }],
    rows: [{ dimensionValues: [{ value: 'merone / referral' }], metricValues: [{ value: '5' }] }],
    rowCount: 1,
  }] });
  assert.equal(result.week.users, 4);
  assert.equal(result.week.page_views, 7);
  assert.deepEqual(result.sources, [{ source_medium: 'merone / referral', sessions: 5 }]);
});

test('GA4 empty reports yield zero while malformed counts fail closed', () => {
  const empty = { metricHeaders: [{ name: 'totalUsers' }, { name: 'screenPageViews' }] };
  const source = { dimensionHeaders: [{ name: 'sessionSourceMedium' }], metricHeaders: [{ name: 'sessions' }] };
  assert.equal(parseGa4Summary({ reports: [empty, empty, empty, source] }).week.users, 0);
  assert.throws(() => parseGa4Summary({ reports: [{ ...empty,
    rows: [{ metricValues: [{ value: '-1' }, { value: '1' }] }] }, empty, empty, source] }));
});
