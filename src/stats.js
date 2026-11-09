/**
 * One place that turns the sanitized `public_reports` view into numbers.
 * Used by the dashboard (GET /api/stats) and the MCP get_area_summary tool, so
 * the two can never disagree. Reads the view only: nothing private is reachable.
 */

const now = () => Math.floor(Date.now() / 1000);
const tally = (rows) => Object.fromEntries(rows.map((r) => [r.severity, r.n]));
const iso = (s) => (s ? new Date(s * 1000).toISOString() : null);

/** @param detail  true adds the time series, live map points and latest reports (dashboard only) */
export async function getStats(env, hours, detail = false) {
  const t = now(), since = t - hours * 3600;
  const bucket = hours > 48 ? 86400 : 3600;          // hourly for a day or two, daily beyond
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);

  const stmts = [
    q(`SELECT severity, COUNT(*) AS n FROM public_reports WHERE created_at >= ? GROUP BY severity`, since),
    q(`SELECT severity, COUNT(*) AS n FROM public_reports WHERE expires_at >= ? GROUP BY severity`, t),
    q(`SELECT ROUND(lat, 2) AS lat, ROUND(lon, 2) AS lon, COUNT(*) AS reports,
              SUM(severity = 'impassable') AS impassable
         FROM public_reports WHERE created_at >= ?
        GROUP BY 1, 2 ORDER BY impassable DESC, reports DESC LIMIT 10`, since),
    q(`SELECT MAX(created_at) AS t FROM public_reports`),
  ];
  if (detail) {
    stmts.push(
      // D1 binds JS numbers as floats, so `/` would not truncate; `%` always does.
      q(`SELECT created_at - (created_at % ?) AS h, severity, COUNT(*) AS n
           FROM public_reports WHERE created_at >= ? GROUP BY h, severity ORDER BY h`, bucket, since),
      q(`SELECT id, lat, lon, severity, note, created_at FROM public_reports
          WHERE expires_at >= ? ORDER BY created_at DESC LIMIT 300`, t),
      q(`SELECT id, lat, lon, severity, note, created_at, expires_at FROM public_reports
          WHERE created_at >= ? ORDER BY created_at DESC LIMIT 15`, since),
    );
  }
  const [bySev, liveSev, cells, last, series, live, recent] = (await env.DB.batch(stmts)).map((r) => r.results);

  const liveBy = tally(liveSev);
  const out = {
    window_hours: hours,
    by_severity: tally(bySev),
    live_now: Object.values(liveBy).reduce((a, b) => a + b, 0),
    live_by_severity: liveBy,
    worst_cells: cells,
    latest_report_at: iso(last[0]?.t),
  };
  if (detail) Object.assign(out, { server_time: t, bucket_s: bucket, series, live_reports: live, recent });
  return out;
}
