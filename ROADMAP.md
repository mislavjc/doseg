# Roadmap

Roughly ordered by how much sense they make next. For the detailed `/statistika` implementation plan (67 features, status tracking, code locations), see [STATS-PLAN.md](STATS-PLAN.md).

| Feature | Effort | Description |
|---------|--------|-------------|
| Nearest hospital/school by transit | Medium | "From Sesvete, 3 hospitals reachable in 30 min." POI library exists (`lib/overpass.ts`), needs isochrone integration. |
| Network bottleneck analysis | Medium | Crnomerec is the sole link between the western bus network and trams — if it goes down, 22 bus routes lose tram access. |
| "Last tram home" per district | Medium | Map colored by the latest departure that still gets you to Trg bana Jelačića. When does transit stop serving each district? |
| Multimodal hub map | Medium | Show the 63 multimodal stops and 5 critical bottlenecks. Only 1 tram-rail interchange in all of Zagreb (Horvati). |
| "What if" line simulator | High | Draw a hypothetical new bus route, see how district scores change. Requires route editor UI + re-scoring. |
| Line removal impact | High | Remove each line and re-score all districts. "Tram 11 removal drops 4 districts by >10 points." |
| Real-time reliability tracker | High | RT data is persisted to SQLite, query endpoints are live. Next: frontend dashboards for punctuality trends and delay corridors. |
| Animated time-of-day slider | High | Watch the city "breathe" — isochrone expanding at 06:00, steady at 08:00, shrinking at 23:00. ~20 hourly snapshots. |
| Cycling infrastructure coverage | High | Zagreb Open Data has 2,889 cycling path segments. Show km of bike lanes per km² per district. |
| BAJS station placement optimizer | High | Identify where adding a new station most improves district scores. "Put one station HERE, Podsused gains +8%." |
| Reverse isochrone | Medium | Flip from "where can I go?" to "where can people reach this point from?" Useful for evaluating venue accessibility. |
| "Where should we meet?" | Medium | Two origins, overlapping isochrones, suggested meeting area at lowest combined travel time. |
| Animated expansion | Medium | Play button sweeping from 0 to 45 minutes, watching the isochrone grow in real-time. |
| Commute evaluator | Medium | Pin your workplace, explore commute times from any potential home. Reverse isochrone framed for apartment hunting. |
| "Rate my commute" | Medium | Enter home and work address, see transit options, compare to city average. |
| Embeddable widget | High | Lightweight iframe version for real estate listings, tourism sites, or city planning pages. |
| Multi-city | High | Load different GTFS + OSM data for Split, Rijeka, or other Croatian cities. The architecture generalizes. |
