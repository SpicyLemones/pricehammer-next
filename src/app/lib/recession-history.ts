// src/app/lib/recession-history.ts
//
// History of the collected Seek counts. The weekly collector
// (.github/workflows/recession-collect.yml) appends one row per series per
// run to recession_series; this turns those rows into weekly trend lines,
// week/month changes, and "as it was on <date>" snapshots.

import { all } from "@/app/lib/sql";
import { INDUSTRIES, type IndustrySlug } from "@/app/lib/recession-industries";

export type TrendPoint = { day: string; value: number };

export type Change = { from: TrendPoint; diff: number; pct: number | null };

export type SeriesTrend = {
  series: string;
  /** one point per ISO week (the last reading of that week), oldest first */
  points: TrendPoint[];
};

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Monday of the ISO week a day falls in. */
function weekStart(day: string): string {
  const d = new Date(toMs(day));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The tech page's series are named seek-ict-*, every other page uses its slug. */
export function seekPrefix(slug: IndustrySlug): string {
  return `seek-${slug === "tech" ? "ict" : slug}`;
}

/** Weekly trend for every collected series, keyed by series name. */
export async function getSeekTrends(seriesLike = "seek-%"): Promise<Record<string, SeriesTrend>> {
  let rows: { day: string; series: string; value: number }[] = [];
  try {
    rows = (await all(
      `SELECT day, series, value FROM recession_series WHERE series LIKE ? ORDER BY series, day ASC`,
      [seriesLike],
    )) as typeof rows;
  } catch {
    return {}; // table not created yet on this deployment
  }
  const out: Record<string, SeriesTrend> = {};
  for (const r of rows) {
    const trend = (out[r.series] ??= { series: r.series, points: [] });
    const last = trend.points[trend.points.length - 1];
    const point = { day: r.day, value: Number(r.value) };
    // rows arrive oldest first, so a later reading in the same week replaces the earlier one
    if (last && weekStart(last.day) === weekStart(r.day)) trend.points[trend.points.length - 1] = point;
    else trend.points.push(point);
  }
  return out;
}

/** Most recent reading on or before `day` (the newest reading when `day` is omitted). */
export function pointAsOf(points: TrendPoint[], day?: string | null): TrendPoint | null {
  if (!points.length) return null;
  if (!day) return points[points.length - 1];
  let found: TrendPoint | null = null;
  for (const p of points) {
    if (p.day <= day) found = p;
    else break;
  }
  return found;
}

/**
 * Change between `at` and the reading closest to `daysBack` days earlier.
 * Returns null unless a reading exists within `tolerance` days of that target,
 * so a gap in collection never gets passed off as a "weekly" change.
 */
export function changeOver(
  points: TrendPoint[],
  at: TrendPoint,
  daysBack: number,
  tolerance: number,
): Change | null {
  const target = toMs(at.day) - daysBack * DAY_MS;
  let best: TrendPoint | null = null;
  for (const p of points) {
    if (p.day >= at.day) break;
    if (!best || Math.abs(toMs(p.day) - target) < Math.abs(toMs(best.day) - target)) best = p;
  }
  if (!best || Math.abs(toMs(best.day) - target) > tolerance * DAY_MS) return null;
  return changeBetween(best, at);
}

export function changeBetween(from: TrendPoint, to: TrendPoint): Change {
  const diff = to.value - from.value;
  return { from, diff, pct: from.value > 0 ? (diff / from.value) * 100 : null };
}

export type IndustryHistoryRow = {
  slug: IndustrySlug;
  name: string;
  /** reading shown for the selected date; null when nothing was collected by then */
  at: TrendPoint | null;
  week: Change | null;
  month: Change | null;
  sinceStart: Change | null;
  points: TrendPoint[];
  graduate: TrendPoint | null;
};

export type HistoryOverview = {
  /** every day a collection ran, newest first */
  days: string[];
  /** the collection day the table reflects (null when nothing is collected yet) */
  selected: string | null;
  rows: IndustryHistoryRow[];
};

/** All industries as they stood on `day` (latest collection when omitted or unknown). */
export async function getHistoryOverview(day?: string | null): Promise<HistoryOverview> {
  const trends = await getSeekTrends();
  const daySet = new Set<string>();
  for (const t of Object.values(trends)) for (const p of t.points) daySet.add(p.day);
  const days = [...daySet].sort().reverse();
  const valid = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  // snap to the collection on or before the requested date
  const selected = (valid ? days.find((d) => d <= valid) : days[0]) ?? days[0] ?? null;

  const rows = (Object.keys(INDUSTRIES) as IndustrySlug[]).map((slug): IndustryHistoryRow => {
    const all = trends[`${seekPrefix(slug)}-all`]?.points ?? [];
    const grad = trends[`${seekPrefix(slug)}-graduate`]?.points ?? [];
    const upTo = selected ? all.filter((p) => p.day <= selected) : [];
    const at = upTo[upTo.length - 1] ?? null;
    return {
      slug,
      name: INDUSTRIES[slug].name,
      at,
      week: at ? changeOver(upTo, at, 7, 4) : null,
      month: at ? changeOver(upTo, at, 28, 10) : null,
      sinceStart: at && upTo.length > 1 ? changeBetween(upTo[0], at) : null,
      points: upTo,
      graduate: pointAsOf(grad, selected),
    };
  });
  rows.sort((a, b) => (b.at?.value ?? -1) - (a.at?.value ?? -1));
  return { days, selected, rows };
}
