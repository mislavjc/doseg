//! Per-bike flow tracking for BAJS (Zagreb bike share).
//!
//! The `bajs_usage` table records how many bikes sit at stations, and infers
//! "in use" as (rolling 24h peak - current). That inference is not a ride
//! count: it misses bikes already rented during the nightly peak and counts
//! service withdrawals as rides.
//!
//! The GBFS `free_bike_status` feed lists every docked bike individually with
//! a `bike_id` that stays stable while the bike is docked. Diffing consecutive
//! snapshots therefore yields exact events: a bike_id leaving the feed is one
//! rental start at its station, a bike_id appearing is one return. Those are
//! measurements, not estimates.
//!
//! Three things still need care and are handled here:
//! - Bikes drop out of the feed for a single poll and come back to the same
//!   dock without having moved. Measured live, that flicker accounted for
//!   roughly one in six apparent departures, so a departure is only counted
//!   once a second poll confirms the bike is still gone.
//! - Rebalancing trucks move several bikes at one station within a single
//!   poll. Those are classified separately (`bulk_out` / `bulk_in`) so they
//!   never inflate ride counts.
//! - When polling stalls, one diff spans many minutes and conflates events.
//!   Every delta carries `gap_sec` so consumers can discard bad intervals
//!   instead of reading them as quiet ones.

use std::collections::{HashMap, HashSet};

/// Departures (or arrivals) at one station within one poll beyond this count
/// are treated as a rebalancing move rather than as riders.
pub const BULK_THRESHOLD: i64 = 4;

/// A poll separated from the previous one by more than this is still recorded,
/// but flagged: its events cannot be attributed to a single minute.
pub const MAX_RELIABLE_GAP_SEC: i64 = 180;

/// A bike that left this long ago is dropped from trip matching. It either
/// came back under a rotated id or left service.
pub const MAX_TRIP_DURATION_SEC: i64 = 6 * 3600;

/// Shortest gap over which a bike appearing at a different dock, without ever
/// having left the feed, is believable as a ride. Below this it is a feed
/// correction reassigning a parked bike, not somebody pedalling.
pub const MIN_OBSERVABLE_RIDE_SEC: i64 = 120;

/// One docked bike as reported by `free_bike_status`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BikeObservation {
    pub bike_id: String,
    pub station_id: String,
}

/// A ride whose bike kept its id from departure to return, so both ends are
/// known. Trips whose id rotated mid-ride are invisible here but still counted
/// in `starts` / `returns`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MatchedTrip {
    pub departed_ts: i64,
    pub arrived_ts: i64,
    pub from_station: String,
    pub to_station: String,
}

/// What changed at one station between two polls.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct StationDelta {
    pub starts: i64,
    pub returns: i64,
    pub bulk_out: i64,
    pub bulk_in: i64,
}

/// What changed system-wide between two polls.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PollDelta {
    pub ts: i64,
    /// Seconds since the previous poll. 60 is nominal; larger means the
    /// events below are spread over an unknown part of that window.
    pub gap_sec: i64,
    pub starts: i64,
    pub returns: i64,
    pub bulk_out: i64,
    pub bulk_in: i64,
    pub docked: i64,
    /// Stations holding at least one bike right now, not the size of the
    /// network. A station standing empty is absent from this count.
    pub stations: i64,
    pub per_station: HashMap<String, StationDelta>,
    pub trips: Vec<MatchedTrip>,
}

impl PollDelta {
    /// Whether the gap is short enough to attribute these events to this
    /// minute. Long gaps are still stored, but marked.
    pub fn is_reliable(&self) -> bool {
        self.gap_sec > 0 && self.gap_sec <= MAX_RELIABLE_GAP_SEC
    }
}

/// One station's accumulated hour, ready to be written.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StationHour {
    pub starts: i64,
    pub returns: i64,
    pub bulk_out: i64,
    pub bulk_in: i64,
    pub sum_bikes: i64,
    pub min_bikes: i64,
    pub max_bikes: i64,
    pub empty_samples: i64,
    pub samples: i64,
}

/// A completed hour of per-station aggregates.
#[derive(Clone, Debug, PartialEq)]
pub struct HourFlush {
    pub hour_ts: i64,
    pub stations: Vec<(String, StationHour)>,
}

/// The result of feeding one poll into the tracker.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PollOutcome {
    /// None on the very first poll, which only seeds state.
    pub delta: Option<PollDelta>,
    /// Some when this poll crossed an hour boundary.
    pub flush: Option<HourFlush>,
}

/// Diffs consecutive `free_bike_status` snapshots into ride events.
pub struct BikeTracker {
    docked: HashMap<String, String>,
    /// bike_id -> (station, ts it went missing) for bikes absent from exactly
    /// one poll. Held back until a second poll confirms the bike really left.
    pending: HashMap<String, (String, i64)>,
    /// bike_id -> (origin station, departure ts) for bikes currently out.
    in_flight: HashMap<String, (String, i64)>,
    last_poll_ts: Option<i64>,
    hour_ts: i64,
    hour_acc: HashMap<String, StationHour>,
}

impl Default for BikeTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl BikeTracker {
    pub fn new() -> Self {
        BikeTracker {
            docked: HashMap::new(),
            pending: HashMap::new(),
            in_flight: HashMap::new(),
            last_poll_ts: None,
            hour_ts: 0,
            hour_acc: HashMap::new(),
        }
    }

    /// Bikes currently believed to be out on a ride, with a known origin.
    /// A lower bound on concurrent rides, not a fleet figure.
    pub fn in_flight_count(&self) -> usize {
        self.in_flight.len()
    }

    /// Feed one snapshot. `known_stations` is the full station list, used so
    /// that stations sitting empty are recorded as empty rather than missing.
    pub fn observe(
        &mut self,
        ts: i64,
        observations: &[BikeObservation],
        known_stations: &[String],
    ) -> PollOutcome {
        let now: HashMap<&str, &str> = observations
            .iter()
            .map(|o| (o.bike_id.as_str(), o.station_id.as_str()))
            .collect();

        let mut outcome = PollOutcome::default();

        if let Some(prev_ts) = self.last_poll_ts {
            outcome.delta = Some(self.diff(ts, prev_ts, &now, observations));
        }

        let hour = ts - ts.rem_euclid(3600);
        if self.last_poll_ts.is_some() && hour != self.hour_ts && !self.hour_acc.is_empty() {
            outcome.flush = Some(self.take_hour());
        }
        self.hour_ts = hour;

        self.accumulate_occupancy(observations, known_stations);
        if let Some(ref delta) = outcome.delta {
            for (station_id, sd) in &delta.per_station {
                let acc = self.hour_acc.entry(station_id.clone()).or_default();
                acc.starts += sd.starts;
                acc.returns += sd.returns;
                acc.bulk_out += sd.bulk_out;
                acc.bulk_in += sd.bulk_in;
            }
        }

        self.docked = observations
            .iter()
            .map(|o| (o.bike_id.clone(), o.station_id.clone()))
            .collect();
        self.last_poll_ts = Some(ts);
        self.in_flight
            .retain(|_, (_, departed)| ts - *departed <= MAX_TRIP_DURATION_SEC);

        outcome
    }

    fn diff(
        &mut self,
        ts: i64,
        prev_ts: i64,
        now: &HashMap<&str, &str>,
        observations: &[BikeObservation],
    ) -> PollDelta {
        let mut per_station: HashMap<String, StationDelta> = HashMap::new();
        let mut trips = Vec::new();

        // Bikes whose absence was settled here, so the arrivals pass below
        // does not count them a second time.
        let mut resolved: HashSet<String> = HashSet::new();

        // Resolve bikes that went missing at the previous poll. Bikes drop out
        // of the feed briefly without moving, so a single missing poll is not
        // yet a ride: one back at its own dock never left.
        for (bike_id, (station_id, missing_since)) in std::mem::take(&mut self.pending) {
            resolved.insert(bike_id.clone());
            match now.get(bike_id.as_str()) {
                None => {
                    // Absent twice running: a ride really did start.
                    per_station.entry(station_id.clone()).or_default().starts += 1;
                    self.in_flight.insert(bike_id, (station_id, missing_since));
                }
                Some(&current) if current == station_id => {
                    // Feed flicker. Neither a start nor a return.
                }
                Some(&current) => {
                    // Gone and back at another dock: a short ride, both ends known.
                    per_station.entry(station_id.clone()).or_default().starts += 1;
                    per_station.entry(current.to_string()).or_default().returns += 1;
                    trips.push(MatchedTrip {
                        departed_ts: missing_since,
                        arrived_ts: ts,
                        from_station: station_id,
                        to_station: current.to_string(),
                    });
                }
            }
        }

        // Newly missing: quarantined until the next poll confirms it.
        for (bike_id, station_id) in &self.docked {
            if !now.contains_key(bike_id.as_str()) {
                self.pending
                    .insert(bike_id.clone(), (station_id.clone(), prev_ts));
            }
        }

        // Back in the feed after a confirmed absence, or under an id we have
        // never seen: a return.
        for obs in observations {
            match self.docked.get(&obs.bike_id) {
                // Sat still, or already resolved above as flicker or short ride.
                Some(prev_station) if prev_station == &obs.station_id => continue,
                Some(prev_station) => {
                    // Docked somewhere else without ever leaving the feed. Over
                    // a normal poll interval that is the feed correcting where
                    // a parked bike lives, not a ride nobody could have taken.
                    if ts - prev_ts < MIN_OBSERVABLE_RIDE_SEC {
                        continue;
                    }
                    per_station
                        .entry(obs.station_id.clone())
                        .or_default()
                        .returns += 1;
                    per_station.entry(prev_station.clone()).or_default().starts += 1;
                    trips.push(MatchedTrip {
                        departed_ts: prev_ts,
                        arrived_ts: ts,
                        from_station: prev_station.clone(),
                        to_station: obs.station_id.clone(),
                    });
                    self.in_flight.remove(&obs.bike_id);
                }
                None => {
                    if resolved.contains(&obs.bike_id) {
                        continue;
                    }
                    per_station
                        .entry(obs.station_id.clone())
                        .or_default()
                        .returns += 1;
                    if let Some((from_station, departed_ts)) = self.in_flight.remove(&obs.bike_id) {
                        trips.push(MatchedTrip {
                            departed_ts,
                            arrived_ts: ts,
                            from_station,
                            to_station: obs.station_id.clone(),
                        });
                    }
                }
            }
        }

        // Several bikes moving at one station inside one poll is a truck, not
        // a queue of riders. Reclassify so ride counts stay honest.
        for sd in per_station.values_mut() {
            if sd.starts >= BULK_THRESHOLD {
                sd.bulk_out = sd.starts;
                sd.starts = 0;
            }
            if sd.returns >= BULK_THRESHOLD {
                sd.bulk_in = sd.returns;
                sd.returns = 0;
            }
        }

        let mut delta = PollDelta {
            ts,
            gap_sec: ts - prev_ts,
            docked: observations.len() as i64,
            stations: observations
                .iter()
                .map(|o| o.station_id.as_str())
                .collect::<HashSet<_>>()
                .len() as i64,
            trips,
            ..Default::default()
        };
        for sd in per_station.values() {
            delta.starts += sd.starts;
            delta.returns += sd.returns;
            delta.bulk_out += sd.bulk_out;
            delta.bulk_in += sd.bulk_in;
        }
        delta.per_station = per_station;
        delta
    }

    fn accumulate_occupancy(
        &mut self,
        observations: &[BikeObservation],
        known_stations: &[String],
    ) {
        let mut counts: HashMap<&str, i64> = HashMap::new();
        for obs in observations {
            *counts.entry(obs.station_id.as_str()).or_insert(0) += 1;
        }
        for station_id in known_stations {
            let bikes = counts.remove(station_id.as_str()).unwrap_or(0);
            self.record_occupancy(station_id, bikes);
        }
        // Stations present in the bike feed but missing from the station list.
        let leftovers: Vec<(String, i64)> = counts
            .into_iter()
            .map(|(id, bikes)| (id.to_string(), bikes))
            .collect();
        for (station_id, bikes) in leftovers {
            self.record_occupancy(&station_id, bikes);
        }
    }

    fn record_occupancy(&mut self, station_id: &str, bikes: i64) {
        let acc = match self.hour_acc.get_mut(station_id) {
            Some(acc) => acc,
            None => self
                .hour_acc
                .entry(station_id.to_string())
                .or_insert_with(|| StationHour {
                    min_bikes: i64::MAX,
                    ..Default::default()
                }),
        };
        acc.sum_bikes += bikes;
        acc.samples += 1;
        acc.min_bikes = acc.min_bikes.min(bikes);
        acc.max_bikes = acc.max_bikes.max(bikes);
        if bikes == 0 {
            acc.empty_samples += 1;
        }
    }

    fn take_hour(&mut self) -> HourFlush {
        let mut stations: Vec<(String, StationHour)> = self
            .hour_acc
            .drain()
            .map(|(id, mut acc)| {
                if acc.min_bikes == i64::MAX {
                    acc.min_bikes = 0;
                }
                (id, acc)
            })
            .collect();
        stations.sort_by(|a, b| a.0.cmp(&b.0));
        HourFlush {
            hour_ts: self.hour_ts,
            stations,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obs(pairs: &[(&str, &str)]) -> Vec<BikeObservation> {
        pairs
            .iter()
            .map(|(bike, station)| BikeObservation {
                bike_id: (*bike).to_string(),
                station_id: (*station).to_string(),
            })
            .collect()
    }

    fn stations() -> Vec<String> {
        vec!["A".to_string(), "B".to_string()]
    }

    #[test]
    fn first_poll_only_seeds_state() {
        let mut t = BikeTracker::new();
        let out = t.observe(0, &obs(&[("b1", "A")]), &stations());
        assert!(out.delta.is_none());
        assert!(out.flush.is_none());
    }

    #[test]
    fn a_single_missing_poll_is_not_yet_a_ride() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A"), ("b2", "A")]), &stations());

        let out = t.observe(60, &obs(&[("b2", "A")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 0, "held back until the next poll confirms it");
        assert_eq!(t.in_flight_count(), 0);
    }

    #[test]
    fn feed_flicker_is_not_a_ride() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());
        t.observe(60, &obs(&[]), &stations());

        let out = t.observe(120, &obs(&[("b1", "A")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 0, "a bike back at its own dock never left");
        assert_eq!(delta.returns, 0);
        assert!(delta.trips.is_empty());
        assert_eq!(t.in_flight_count(), 0);
    }

    #[test]
    fn departure_and_return_are_counted_exactly() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A"), ("b2", "A")]), &stations());
        t.observe(60, &obs(&[("b2", "A")]), &stations());

        let out = t.observe(120, &obs(&[("b2", "A")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 1, "absent twice running is a real departure");
        assert_eq!(delta.returns, 0);
        assert_eq!(delta.per_station["A"].starts, 1);
        assert_eq!(t.in_flight_count(), 1);

        let out = t.observe(180, &obs(&[("b1", "B"), ("b2", "A")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.returns, 1);
        assert_eq!(delta.per_station["B"].returns, 1);
        assert_eq!(
            delta.trips,
            vec![MatchedTrip {
                departed_ts: 0,
                arrived_ts: 180,
                from_station: "A".into(),
                to_station: "B".into(),
            }],
            "departure is dated to when the bike was last seen docked"
        );
        assert_eq!(t.in_flight_count(), 0);
    }

    #[test]
    fn a_ride_finished_inside_one_poll_keeps_both_ends() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());
        t.observe(60, &obs(&[]), &stations());

        let out = t.observe(120, &obs(&[("b1", "B")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 1);
        assert_eq!(delta.returns, 1);
        assert_eq!(delta.per_station["A"].starts, 1);
        assert_eq!(delta.per_station["B"].returns, 1);
        assert_eq!(delta.trips.len(), 1);
        assert_eq!(t.in_flight_count(), 0);
    }

    #[test]
    fn a_dock_reassignment_inside_one_poll_is_not_a_ride() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());

        let out = t.observe(60, &obs(&[("b1", "B")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 0, "nobody rides A to B in under a minute");
        assert_eq!(delta.returns, 0);
        assert!(delta.trips.is_empty());
    }

    #[test]
    fn the_same_move_over_a_rideable_gap_counts() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());

        let out = t.observe(600, &obs(&[("b1", "B")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 1);
        assert_eq!(delta.returns, 1);
        assert_eq!(delta.trips.len(), 1);
    }

    #[test]
    fn return_under_a_rotated_id_still_counts_as_a_return() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());
        t.observe(60, &obs(&[]), &stations());

        let out = t.observe(120, &obs(&[("fresh", "B")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.returns, 1);
        assert_eq!(delta.starts, 1, "b1 is confirmed gone at the same poll");
        assert!(delta.trips.is_empty(), "no origin is known for a new id");
        assert_eq!(t.in_flight_count(), 1, "b1 stays out until it times out");
    }

    #[test]
    fn bulk_moves_are_kept_out_of_ride_counts() {
        let mut t = BikeTracker::new();
        let full = obs(&[
            ("b1", "A"),
            ("b2", "A"),
            ("b3", "A"),
            ("b4", "A"),
            ("b5", "B"),
        ]);
        t.observe(0, &full, &stations());
        t.observe(60, &obs(&[("b5", "B")]), &stations());

        let out = t.observe(120, &obs(&[("b5", "B")]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 0, "four at once is a truck, not four riders");
        assert_eq!(delta.bulk_out, 4);
        assert_eq!(delta.per_station["A"].bulk_out, 4);
    }

    #[test]
    fn three_departures_stay_rides() {
        let mut t = BikeTracker::new();
        t.observe(
            0,
            &obs(&[("b1", "A"), ("b2", "A"), ("b3", "A")]),
            &stations(),
        );
        t.observe(60, &obs(&[]), &stations());

        let out = t.observe(120, &obs(&[]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.starts, 3);
        assert_eq!(delta.bulk_out, 0);
    }

    #[test]
    fn a_stalled_poll_is_marked_unreliable() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());
        t.observe(60, &obs(&[]), &stations());

        let out = t.observe(3660, &obs(&[]), &stations());
        let delta = out.delta.unwrap();
        assert_eq!(delta.gap_sec, 3600);
        assert!(!delta.is_reliable());
        assert_eq!(delta.starts, 1, "the event is still recorded");
    }

    #[test]
    fn hourly_flush_carries_occupancy_and_flow() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A"), ("b2", "A")]), &stations());
        t.observe(60, &obs(&[("b1", "A")]), &stations());
        t.observe(120, &obs(&[("b1", "A")]), &stations());

        let out = t.observe(3600, &obs(&[("b1", "A")]), &stations());
        let flush = out.flush.expect("hour boundary flushes");
        assert_eq!(flush.hour_ts, 0);
        let by_id: HashMap<_, _> = flush.stations.into_iter().collect();

        let a = &by_id["A"];
        assert_eq!(a.samples, 3);
        assert_eq!(a.max_bikes, 2);
        assert_eq!(a.min_bikes, 1);
        assert_eq!(a.starts, 1);
        assert_eq!(a.sum_bikes, 4, "2 bikes then 1 then 1");

        let b = &by_id["B"];
        assert_eq!(b.samples, 3, "an empty station is still observed");
        assert_eq!(b.empty_samples, 3);
        assert_eq!(b.max_bikes, 0);
        assert_eq!(b.min_bikes, 0);
    }

    #[test]
    fn a_bike_out_longer_than_the_cap_is_forgotten() {
        let mut t = BikeTracker::new();
        t.observe(0, &obs(&[("b1", "A")]), &stations());
        t.observe(60, &obs(&[]), &stations());
        t.observe(120, &obs(&[]), &stations());
        assert_eq!(t.in_flight_count(), 1);
        t.observe(MAX_TRIP_DURATION_SEC + 61, &obs(&[]), &stations());
        assert_eq!(t.in_flight_count(), 0);
    }
}
