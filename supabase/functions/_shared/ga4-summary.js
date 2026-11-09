const totalsRequest = (startDate, endDate) => ({
  dateRanges: [{ startDate, endDate }],
  metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }],
});

export function ga4SummaryRequest() {
  return { requests: [
    totalsRequest('today', 'today'),
    totalsRequest('yesterday', 'yesterday'),
    totalsRequest('6daysAgo', 'today'),
    {
      dateRanges: [{ startDate: '6daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '20',
    },
  ] };
}

function nonnegativeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid GA4 count');
  return number;
}

export function parseGa4Summary(response) {
  if (!Array.isArray(response?.reports) || response.reports.length !== 4) {
    throw new Error('Incomplete GA4 response');
  }
  const period = report => {
    if (report.metricHeaders?.[0]?.name !== 'totalUsers'
      || report.metricHeaders?.[1]?.name !== 'screenPageViews') {
      throw new Error('Unexpected GA4 metrics');
    }
    const values = report.rows?.[0]?.metricValues;
    if (!values) return { users: 0, page_views: 0 };
    return { users: nonnegativeInteger(values[0]?.value),
      page_views: nonnegativeInteger(values[1]?.value) };
  };
  const sourceReport = response.reports[3];
  if (sourceReport.dimensionHeaders?.[0]?.name !== 'sessionSourceMedium'
    || sourceReport.metricHeaders?.[0]?.name !== 'sessions') {
    throw new Error('Unexpected GA4 source metrics');
  }
  return {
    today: period(response.reports[0]),
    yesterday: period(response.reports[1]),
    week: period(response.reports[2]),
    sources: (sourceReport.rows || []).map(row => ({
      source_medium: String(row.dimensionValues?.[0]?.value || '(not set)').slice(0,160),
      sessions: nonnegativeInteger(row.metricValues?.[0]?.value),
    })),
    source_row_count: nonnegativeInteger(sourceReport.rowCount || 0),
  };
}
