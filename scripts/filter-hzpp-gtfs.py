#!/usr/bin/env python3
"""Filter HZPP GTFS to only include routes passing through the Zagreb area."""

import csv
import io
import math
import sys
import zipfile
from collections import defaultdict

ZAGREB_LAT, ZAGREB_LON = 45.815, 15.977
MAX_DIST_KM = 40

def dist_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))

def read_csv(zf, name):
    with zf.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))

def write_csv(zf_out, name, rows, fieldnames):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    zf_out.writestr(name, buf.getvalue())

def main():
    src = sys.argv[1]
    dst = sys.argv[2]

    with zipfile.ZipFile(src) as zf:
        stops = read_csv(zf, "stops.txt")
        routes = read_csv(zf, "routes.txt")
        trips = read_csv(zf, "trips.txt")
        stop_times = read_csv(zf, "stop_times.txt")
        calendar = read_csv(zf, "calendar.txt")
        agency = read_csv(zf, "agency.txt")
        calendar_dates = read_csv(zf, "calendar_dates.txt") if "calendar_dates.txt" in zf.namelist() else None

    # 1. Find stops within range of Zagreb
    zg_stop_ids = {
        s["stop_id"] for s in stops
        if dist_km(float(s["stop_lat"]), float(s["stop_lon"]),
                   ZAGREB_LAT, ZAGREB_LON) <= MAX_DIST_KM
    }
    print(f"Stops within {MAX_DIST_KM}km of Zagreb: {len(zg_stop_ids)}/{len(stops)}")

    # 2. Find trips that use Zagreb-area stops
    zg_trip_ids = {st["trip_id"] for st in stop_times if st["stop_id"] in zg_stop_ids}
    print(f"Trips through Zagreb area: {len(zg_trip_ids)}/{len(trips)}")

    # 3. Find routes for those trips
    zg_route_ids = {t["route_id"] for t in trips if t["trip_id"] in zg_trip_ids}
    print(f"Routes through Zagreb area: {len(zg_route_ids)}/{len(routes)}")

    # 4. Filter to matching routes, then deduplicate trips.
    # HZ GTFS creates one trip per calendar day with identical stop_times,
    # causing ~48x bloat. Keep one trip per unique stop-time pattern per route.
    route_trips = defaultdict(list)
    for t in trips:
        if t["route_id"] in zg_route_ids:
            route_trips[t["route_id"]].append(t)

    # Build stop_times index for Zagreb-route trips only, pre-sorted
    route_trip_ids = {t["trip_id"] for rtrips in route_trips.values() for t in rtrips}
    st_by_trip = defaultdict(list)
    for st in stop_times:
        if st["trip_id"] in route_trip_ids:
            st_by_trip[st["trip_id"]].append(st)
    for sts in st_by_trip.values():
        sts.sort(key=lambda x: int(x["stop_sequence"]))

    keep_trips = set()
    for _, rtrips in route_trips.items():
        seen_patterns = set()
        for t in rtrips:
            sts = st_by_trip.get(t["trip_id"], [])
            pattern_key = tuple(
                (s["stop_id"], s["departure_time"]) for s in sts
            )
            if pattern_key not in seen_patterns:
                seen_patterns.add(pattern_key)
                keep_trips.add(t["trip_id"])

    keep_services = {t["service_id"] for t in trips if t["trip_id"] in keep_trips}

    f_routes = [r for r in routes if r["route_id"] in zg_route_ids]
    f_trips = [{**t} for t in trips if t["trip_id"] in keep_trips]
    f_stop_times = [st for st in stop_times if st["trip_id"] in keep_trips]
    keep_stops = {st["stop_id"] for st in f_stop_times}
    f_stops = [s for s in stops if s["stop_id"] in keep_stops]
    f_calendar = [c for c in calendar if c["service_id"] in keep_services]

    print(f"Deduplicated: {sum(len(v) for v in route_trips.values())} -> {len(keep_trips)} trips")
    print(f"Filtered: {len(f_routes)} routes, {len(f_trips)} trips, "
          f"{len(f_stops)} stops, {len(f_stop_times)} stop_times")

    # 5. Generate shapes.txt from stop coordinates.
    # HZ GTFS has no shapes.txt, so OTP can't generate rail pattern geometries.
    # Create straight-line shapes between stops for each unique stop sequence.
    stop_coords = {s["stop_id"]: (s["stop_lat"], s["stop_lon"]) for s in f_stops}
    shapes = []
    shape_id_map = {}  # trip_id -> shape_id

    # Group trips by stop sequence to avoid duplicate shapes
    seq_to_shape = {}
    for t in f_trips:
        sts = st_by_trip.get(t["trip_id"], [])
        seq_key = tuple(s["stop_id"] for s in sts)
        if seq_key not in seq_to_shape:
            shape_id = f"shape_{len(seq_to_shape)}"
            seq_to_shape[seq_key] = shape_id
            for i, stop_id in enumerate(seq_key):
                if stop_id in stop_coords:
                    lat, lon = stop_coords[stop_id]
                    shapes.append({
                        "shape_id": shape_id,
                        "shape_pt_lat": lat,
                        "shape_pt_lon": lon,
                        "shape_pt_sequence": str(i),
                    })
        shape_id_map[t["trip_id"]] = seq_to_shape[seq_key]

    # Add shape_id to trips
    for t in f_trips:
        t["shape_id"] = shape_id_map[t["trip_id"]]

    print(f"Generated {len(seq_to_shape)} shapes ({len(shapes)} points)")

    # 6. Write filtered GTFS
    trip_fields = list(trips[0].keys())
    if "shape_id" not in trip_fields:
        trip_fields.append("shape_id")

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zf_out:
        write_csv(zf_out, "agency.txt", agency, agency[0].keys())
        write_csv(zf_out, "routes.txt", f_routes, routes[0].keys())
        write_csv(zf_out, "trips.txt", f_trips, trip_fields)
        write_csv(zf_out, "stops.txt", f_stops, stops[0].keys())
        write_csv(zf_out, "stop_times.txt", f_stop_times, stop_times[0].keys())
        write_csv(zf_out, "calendar.txt", f_calendar, calendar[0].keys())
        if calendar_dates:
            f_cal_dates = [c for c in calendar_dates if c["service_id"] in keep_services]
            if f_cal_dates:
                write_csv(zf_out, "calendar_dates.txt", f_cal_dates, calendar_dates[0].keys())
        write_csv(zf_out, "shapes.txt", shapes,
                  ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"])

    print(f"Written to {dst}")

if __name__ == "__main__":
    main()
