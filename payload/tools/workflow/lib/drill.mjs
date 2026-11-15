// The restore drill's pure parts (no I/O here): the "Last restore drill" row of docs/RECOVERY.md, written after a drill and
// read by the weekly SecOps report, which flags a drill older than 3 months.
const DAY = 86_400_000;
const ROW = /^\| Last restore drill \|[^|\n]*\|/m;

/** RECOVERY.md with its "Last restore drill" row set to this drill: the date, and how long the restore and the start took. */
export function drillRow(md, { date, restoreSeconds, upSeconds }) {
  const cell = `${date}: restored in ${Math.round(restoreSeconds)} s, the app answered ${Math.round(upSeconds)} s later`;
  return ROW.test(md) ? md.replace(ROW, `| Last restore drill | ${cell} |`) : md;
}

/** A SecOps finding when the last drill is older than 90 days, or none was done while backups are set up. */
export function drillDue(md, now = new Date(), setUp = false) {
  if (md == null) return [];
  const where = 'docs/RECOVERY.md';
  const m = /^\| Last restore drill \| (\d{4}-\d{2}-\d{2})/m.exec(String(md));
  if (!m) return setUp ? [{ area: 'recovery', severity: 'medium', id: 'restore-drill', what: 'no restore drill is recorded yet (npm run drill)', where }] : [];
  const days = Math.floor((now - new Date(`${m[1]}T00:00:00Z`)) / DAY);
  return days > 90 ? [{ area: 'recovery', severity: days > 180 ? 'high' : 'medium', id: 'restore-drill', what: `the last restore drill was ${days} days ago (npm run drill)`, where }] : [];
}
