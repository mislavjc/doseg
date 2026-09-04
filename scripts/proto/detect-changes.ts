#!/usr/bin/env bun
/**
 * Robust ZET GTFS change detector.
 *
 * Compares two extracted GTFS feeds (OLD vs NEW) and emits a candidate list of
 * every line (route_short_name) that differs in:
 *   - presence (route_short_name set diff)
 *   - route_long_name
 *   - dominant trip_headsign per direction (highest trip count)
 *
 * It deliberately does NOT diff shapes (the known false-positive source) and
 * never touches the huge stop_times.txt. Only routes.txt + trips.txt +
 * calendar_dates.txt are read.
 *
 * For each dominant headsign it also flags TEMPORARY vs PERMANENT by unioning
 * the calendar_dates date spans of every service that carries that headsign and
 * comparing against the feed validity window. A works/depot/short-turn pattern
 * lives in a sub-window; a real terminal spans the whole window.
 *
 * Usage: bun scripts/proto/detect-changes.ts [OLD_DIR] [NEW_DIR] [OUT_DIR]
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { colIndex, readCsv } from "../lib/gtfs-csv";

const OLD_DIR = process.argv[2] ?? "/tmp/zold";
const NEW_DIR = process.argv[3] ?? "/tmp/znew";
const OUT_DIR = process.argv[4] ?? "/tmp/audit";

// Tolerance (days) for calling a span "reaching" the window edge.
const EDGE_TOL_DAYS = 10;
// A service counts as part of the permanent schedule if it runs to ~the window
// end and covers a meaningful fraction of the window.
const SERVICE_PERM_MIN_FRAC = 0.4;

// ---------------------------------------------------------------------------
// Date helpers (GTFS dates are YYYYMMDD integers)
// ---------------------------------------------------------------------------

function ymdToDayNum(ymd: number): number {
  const y = Math.floor(ymd / 10000);
  const m = Math.floor((ymd % 10000) / 100);
  const d = ymd % 100;
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function dayDiff(a: number, b: number): number {
  return ymdToDayNum(a) - ymdToDayNum(b);
}

function ymdFmt(ymd: number): string {
  const s = String(ymd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ---------------------------------------------------------------------------
// Feed model
// ---------------------------------------------------------------------------

interface ServiceInfo {
  serviceId: string;
  dates: number[]; // sorted ascending
  min: number;
  max: number;
  spanDays: number;
  permanent: boolean; // part of the ongoing schedule (reaches window end)
}

interface HeadsignSpan {
  headsign: string;
  tripCount: number;
  serviceIds: string[];
  firstDate: number | null;
  lastDate: number | null;
  distinctDates: number;
  spanDays: number;
  coverageFrac: number; // span / window span
  permanent: boolean; // union reaches both window edges
}

interface DirInfo {
  // dominant headsign by raw trip count (all trips)
  dominant: HeadsignSpan | null;
  // dominant headsign restricted to trips on permanent services
  permanentDominant: string | null;
  permanentDominantTripCount: number;
  // full headsign distribution (for transparency / debugging)
  headsigns: HeadsignSpan[];
}

interface LineInfo {
  shortName: string;
  routeIds: string[];
  longName: string;
  mode: string;
  present: boolean;
  dir: Record<string, DirInfo>; // "0" / "1" (and any other direction_id seen)
}

interface Feed {
  dir: string;
  windowMin: number;
  windowMax: number;
  windowSpanDays: number;
  services: Map<string, ServiceInfo>;
  lines: Map<string, LineInfo>;
}

function modeFromType(t: string): string {
  switch (t) {
    case "0":
      return "tram";
    case "3":
      return "bus";
    case "1":
      return "subway";
    case "2":
      return "rail";
    case "4":
      return "ferry";
    case "5":
      return "cable";
    case "6":
      return "gondola";
    case "7":
      return "funicular";
    default:
      return `type_${t}`;
  }
}

function parseFeed(dir: string): Feed {
  // --- calendar_dates: service -> dates ---
  const cd = readCsv(join(dir, "calendar_dates.txt"));
  const cdSvc = colIndex(cd.header, "service_id");
  const cdDate = colIndex(cd.header, "date");
  const cdExc = colIndex(cd.header, "exception_type");

  const svcDates = new Map<string, number[]>();
  let windowMin = Infinity;
  let windowMax = -Infinity;
  for (const r of cd.rows) {
    // exception_type 1 = service added on date; 2 = removed. ZET uses only 1,
    // but guard anyway.
    if (r[cdExc] === "2") continue;
    const svc = r[cdSvc];
    const date = Number(r[cdDate]);
    if (!Number.isFinite(date)) continue;
    let arr = svcDates.get(svc);
    if (!arr) {
      arr = [];
      svcDates.set(svc, arr);
    }
    arr.push(date);
    if (date < windowMin) windowMin = date;
    if (date > windowMax) windowMax = date;
  }

  const windowSpanDays = dayDiff(windowMax, windowMin);

  const services = new Map<string, ServiceInfo>();
  for (const [svc, datesRaw] of svcDates) {
    const dates = [...datesRaw].sort((a, b) => a - b);
    const min = dates[0];
    const max = dates[dates.length - 1];
    const spanDays = dayDiff(max, min);
    const reachesEnd = dayDiff(windowMax, max) <= EDGE_TOL_DAYS;
    const frac = windowSpanDays > 0 ? spanDays / windowSpanDays : 1;
    const permanent = reachesEnd && frac >= SERVICE_PERM_MIN_FRAC;
    services.set(svc, { serviceId: svc, dates, min, max, spanDays, permanent });
  }

  // --- routes: route_id -> {short, long, mode} ---
  const rt = readCsv(join(dir, "routes.txt"));
  const rId = colIndex(rt.header, "route_id");
  const rShort = colIndex(rt.header, "route_short_name");
  const rLong = colIndex(rt.header, "route_long_name");
  const rType = colIndex(rt.header, "route_type");

  interface RouteRow {
    short: string;
    long: string;
    mode: string;
  }
  const routeById = new Map<string, RouteRow>();
  for (const r of rt.rows) {
    routeById.set(r[rId], {
      short: r[rShort],
      long: r[rLong],
      mode: modeFromType(r[rType]),
    });
  }

  // --- trips: aggregate per (route_short_name, direction, headsign) ---
  const tp = readCsv(join(dir, "trips.txt"));
  const tRoute = colIndex(tp.header, "route_id");
  const tSvc = colIndex(tp.header, "service_id");
  const tHead = colIndex(tp.header, "trip_headsign");
  const tDir = colIndex(tp.header, "direction_id");

  // line short -> dir -> headsign -> { tripCount, services:Set, permTripCount }
  interface HeadAgg {
    tripCount: number;
    services: Set<string>;
    permTripCount: number;
  }
  const lines = new Map<string, LineInfo>();

  function ensureLine(short: string, route: RouteRow, routeId: string): LineInfo {
    let li = lines.get(short);
    if (!li) {
      li = {
        shortName: short,
        routeIds: [],
        longName: route.long,
        mode: route.mode,
        present: true,
        dir: {},
      };
      lines.set(short, li);
    }
    if (!li.routeIds.includes(routeId)) li.routeIds.push(routeId);
    // If multiple route_ids share a short name with differing long/mode, keep
    // the first non-empty; record nothing fancy (ZET short names are unique).
    if (!li.longName && route.long) li.longName = route.long;
    return li;
  }

  // temporary nested aggregation maps keyed by short
  const agg = new Map<string, Map<string, Map<string, HeadAgg>>>();

  for (const r of tp.rows) {
    const routeId = r[tRoute];
    const route = routeById.get(routeId);
    if (!route) continue;
    const short = route.short;
    ensureLine(short, route, routeId);

    const dir = r[tDir] === "" ? "?" : r[tDir];
    const head = r[tHead];
    const svc = r[tSvc];

    let byDir = agg.get(short);
    if (!byDir) {
      byDir = new Map();
      agg.set(short, byDir);
    }
    let byHead = byDir.get(dir);
    if (!byHead) {
      byHead = new Map();
      byDir.set(dir, byHead);
    }
    let h = byHead.get(head);
    if (!h) {
      h = { tripCount: 0, services: new Set(), permTripCount: 0 };
      byHead.set(head, h);
    }
    h.tripCount++;
    h.services.add(svc);
    if (services.get(svc)?.permanent) h.permTripCount++;
  }

  // Also register lines that exist in routes.txt but have zero trips.
  for (const [routeId, route] of routeById) {
    ensureLine(route.short, route, routeId);
  }

  // Build HeadsignSpan / DirInfo per line.
  function buildHeadsignSpan(headsign: string, h: HeadAgg): HeadsignSpan {
    let firstDate: number | null = null;
    let lastDate: number | null = null;
    const distinct = new Set<number>();
    for (const svc of h.services) {
      const si = services.get(svc);
      if (!si) continue;
      for (const d of si.dates) distinct.add(d);
      if (firstDate === null || si.min < firstDate) firstDate = si.min;
      if (lastDate === null || si.max > lastDate) lastDate = si.max;
    }
    const spanDays = firstDate !== null && lastDate !== null ? dayDiff(lastDate, firstDate) : 0;
    const coverageFrac = windowSpanDays > 0 ? spanDays / windowSpanDays : 1;
    const reachesStart = firstDate !== null && dayDiff(firstDate, windowMin) <= EDGE_TOL_DAYS;
    const reachesEnd = lastDate !== null && dayDiff(windowMax, lastDate) <= EDGE_TOL_DAYS;
    return {
      headsign,
      tripCount: h.tripCount,
      serviceIds: [...h.services].sort(),
      firstDate,
      lastDate,
      distinctDates: distinct.size,
      spanDays,
      coverageFrac,
      permanent: reachesStart && reachesEnd,
    };
  }

  for (const [short, byDir] of agg) {
    const li = lines.get(short)!;
    for (const [dir, byHead] of byDir) {
      const spans: HeadsignSpan[] = [];
      for (const [headsign, h] of byHead) spans.push(buildHeadsignSpan(headsign, h));
      // dominant by raw trip count; tie-break alphabetically for determinism
      spans.sort((a, b) => b.tripCount - a.tripCount || (a.headsign < b.headsign ? -1 : 1));
      const dominant = spans[0] ?? null;

      // permanent-service dominant
      let permDom: string | null = null;
      let permDomCount = 0;
      for (const [headsign, h] of byHead) {
        if (h.permTripCount > permDomCount || (h.permTripCount === permDomCount && permDom !== null && headsign < permDom)) {
          permDomCount = h.permTripCount;
          permDom = h.permTripCount > 0 ? headsign : permDom;
        }
      }
      if (permDomCount === 0) permDom = null;

      li.dir[dir] = {
        dominant,
        permanentDominant: permDom,
        permanentDominantTripCount: permDomCount,
        headsigns: spans,
      };
    }
  }

  return { dir, windowMin, windowMax, windowSpanDays, services, lines };
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

interface Candidate {
  line: string;
  presentOld: boolean;
  presentNew: boolean;
  oldLong: string;
  newLong: string;
  longChanged: boolean;
  oldMode: string;
  newMode: string;
  dirs: Record<
    string,
    {
      oldDominant: string | null;
      newDominant: string | null;
      changed: boolean;
      oldPermanent: boolean | null;
      newPermanent: boolean | null;
      oldPermanentDominant: string | null;
      newPermanentDominant: string | null;
      permanentDominantChanged: boolean;
    }
  >;
  reasons: string[];
  // headsign change persists when restricted to permanent services?
  headsignChangePersistsOnPermanent: boolean;
}

/** Numeric-aware line-number sort ("2" < "11" < "101" < "N1"). */
function byLineNumber(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compare(oldFeed: Feed, newFeed: Feed): Candidate[] {
  const allShorts = new Set<string>([...oldFeed.lines.keys(), ...newFeed.lines.keys()]);
  const sorted = [...allShorts].sort(byLineNumber);

  const candidates: Candidate[] = [];

  for (const short of sorted) {
    const o = oldFeed.lines.get(short);
    const n = newFeed.lines.get(short);
    const presentOld = !!o;
    const presentNew = !!n;

    const reasons: string[] = [];
    if (presentOld && !presentNew) reasons.push("removed");
    if (!presentOld && presentNew) reasons.push("added");

    const oldLong = o?.longName ?? "";
    const newLong = n?.longName ?? "";
    const longChanged = presentOld && presentNew && oldLong !== newLong;
    if (longChanged) reasons.push("long_name");

    const dirs: Candidate["dirs"] = {};
    const allDirKeys = new Set<string>([...Object.keys(o?.dir ?? {}), ...Object.keys(n?.dir ?? {})]);
    let anyHeadsignChanged = false;
    let permPersist = false;
    for (const dk of [...allDirKeys].sort()) {
      const od = o?.dir[dk];
      const nd = n?.dir[dk];
      const oldDom = od?.dominant?.headsign ?? null;
      const newDom = nd?.dominant?.headsign ?? null;
      const changed = presentOld && presentNew && oldDom !== newDom;
      const oldPermDom = od?.permanentDominant ?? null;
      const newPermDom = nd?.permanentDominant ?? null;
      const permDomChanged = presentOld && presentNew && oldPermDom !== newPermDom;
      if (changed) {
        anyHeadsignChanged = true;
        if (permDomChanged) permPersist = true;
      }
      dirs[dk] = {
        oldDominant: oldDom,
        newDominant: newDom,
        changed,
        oldPermanent: od?.dominant?.permanent ?? null,
        newPermanent: nd?.dominant?.permanent ?? null,
        oldPermanentDominant: oldPermDom,
        newPermanentDominant: newPermDom,
        permanentDominantChanged: permDomChanged,
      };
    }
    if (anyHeadsignChanged) reasons.push("dominant_headsign");

    if (reasons.length === 0) continue;

    candidates.push({
      line: short,
      presentOld,
      presentNew,
      oldLong,
      newLong,
      longChanged,
      oldMode: o?.mode ?? "",
      newMode: n?.mode ?? "",
      dirs,
      reasons,
      headsignChangePersistsOnPermanent: permPersist,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function feedSummary(feed: Feed) {
  const linesOut: any[] = [];
  const sorted = [...feed.lines.keys()].sort(byLineNumber);
  for (const short of sorted) {
    const li = feed.lines.get(short)!;
    const dirOut: any = {};
    for (const dk of Object.keys(li.dir).sort()) {
      const di = li.dir[dk];
      dirOut[dk] = {
        dominantHeadsign: di.dominant?.headsign ?? null,
        dominantTripCount: di.dominant?.tripCount ?? 0,
        dominantPermanent: di.dominant?.permanent ?? null,
        dominantFirstDate: di.dominant?.firstDate ? ymdFmt(di.dominant.firstDate) : null,
        dominantLastDate: di.dominant?.lastDate ? ymdFmt(di.dominant.lastDate) : null,
        dominantCoverageFrac: di.dominant ? Number(di.dominant.coverageFrac.toFixed(3)) : null,
        dominantServiceIds: di.dominant?.serviceIds ?? [],
        permanentDominantHeadsign: di.permanentDominant,
        headsigns: di.headsigns.map((h) => ({
          headsign: h.headsign,
          tripCount: h.tripCount,
          permanent: h.permanent,
          first: h.firstDate ? ymdFmt(h.firstDate) : null,
          last: h.lastDate ? ymdFmt(h.lastDate) : null,
          coverageFrac: Number(h.coverageFrac.toFixed(3)),
          serviceIds: h.serviceIds,
        })),
      };
    }
    linesOut.push({
      line: li.shortName,
      routeIds: li.routeIds,
      longName: li.longName,
      mode: li.mode,
      present: li.present,
      directions: dirOut,
    });
  }
  return {
    feedDir: feed.dir,
    window: { from: ymdFmt(feed.windowMin), to: ymdFmt(feed.windowMax), spanDays: feed.windowSpanDays },
    services: [...feed.services.values()]
      .sort((a, b) => (a.serviceId < b.serviceId ? -1 : 1))
      .map((s) => ({
        serviceId: s.serviceId,
        dateCount: s.dates.length,
        from: ymdFmt(s.min),
        to: ymdFmt(s.max),
        spanDays: s.spanDays,
        permanent: s.permanent,
      })),
    lineCount: linesOut.length,
    lines: linesOut,
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const oldFeed = parseFeed(OLD_DIR);
  const newFeed = parseFeed(NEW_DIR);

  const oldSummary = feedSummary(oldFeed);
  const newSummary = feedSummary(newFeed);
  writeFileSync(join(OUT_DIR, "old-summary.json"), JSON.stringify(oldSummary, null, 2));
  writeFileSync(join(OUT_DIR, "new-summary.json"), JSON.stringify(newSummary, null, 2));

  const candidates = compare(oldFeed, newFeed);
  writeFileSync(
    join(OUT_DIR, "candidates.json"),
    JSON.stringify(
      {
        oldFeed: OLD_DIR,
        newFeed: NEW_DIR,
        oldWindow: oldSummary.window,
        newWindow: newSummary.window,
        candidateCount: candidates.length,
        candidates,
      },
      null,
      2,
    ),
  );

  // Human-readable candidate report.
  const lines: string[] = [];
  lines.push(`ZET GTFS change candidates`);
  lines.push(`OLD ${OLD_DIR}  window ${oldSummary.window.from}..${oldSummary.window.to}`);
  lines.push(`NEW ${NEW_DIR}  window ${newSummary.window.from}..${newSummary.window.to}`);
  lines.push(`candidates: ${candidates.length}`);
  lines.push("");
  for (const c of candidates) {
    lines.push(`LINE ${c.line}  [${c.reasons.join(", ")}]`);
    lines.push(`  present: old=${c.presentOld} new=${c.presentNew}  mode: old=${c.oldMode} new=${c.newMode}`);
    if (c.longChanged || c.oldLong !== c.newLong) {
      lines.push(`  long_name: OLD="${c.oldLong}"  NEW="${c.newLong}"${c.longChanged ? "  <-- CHANGED" : ""}`);
    } else {
      lines.push(`  long_name: "${c.oldLong}"`);
    }
    for (const dk of Object.keys(c.dirs).sort()) {
      const d = c.dirs[dk];
      const flag = d.changed ? "  <-- CHANGED" : "";
      lines.push(
        `  dir ${dk}: OLD="${d.oldDominant}" (perm=${d.oldPermanent})  NEW="${d.newDominant}" (perm=${d.newPermanent})${flag}`,
      );
      if (d.changed) {
        lines.push(
          `         permanent-only dominant: OLD="${d.oldPermanentDominant}"  NEW="${d.newPermanentDominant}"  persistsOnPermanent=${d.permanentDominantChanged}`,
        );
      }
    }
    if (c.reasons.includes("dominant_headsign")) {
      lines.push(`  => headsign change persists on permanent service: ${c.headsignChangePersistsOnPermanent}`);
    }
    lines.push("");
  }
  const report = lines.join("\n");
  writeFileSync(join(OUT_DIR, "candidates.txt"), report);

  console.log(report);
  console.log(`\nWrote:`);
  console.log(`  ${join(OUT_DIR, "old-summary.json")}`);
  console.log(`  ${join(OUT_DIR, "new-summary.json")}`);
  console.log(`  ${join(OUT_DIR, "candidates.json")}`);
  console.log(`  ${join(OUT_DIR, "candidates.txt")}`);
}

main();
