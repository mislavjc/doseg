# SEO authority + link-building plan for doseg.hr

> Audited by a 20-agent adversarial review (24 Jun 2026). The data side held up
> exactly; the outreach side had real problems, all corrected below. Do NOT skip the
> "Before any outreach" checklist.

## Where things actually stand (honest framing)

GSC 24 Jun (3-mo): 16 clicks, ~2,130 impressions (vs 448 on 20 Jun = ~4.8x), CTR 0.8%,
avg position 7.2. Many line-number queries sit at **position 6-9 with zero clicks**; clicks
only start around pos 3-5.

There are **two walls, not one** (the earlier "discovery is breaking, position is the only
lever" read was too optimistic):
- **Indexing wall** for the ~150+ pages NOT indexed. With only 3 of ~160 indexed, this is
  still the dominant problem for most of the site. A few line-number queries drawing
  impressions does not prove those pages are indexed: one indexed hub can rank for thousands
  of variants. **Settle this with GSC data before spending effort (see section 5).**
- **Position wall** for the handful already indexed and ranking 6-9.

Authority (links) is the **most plausible** remaining lever, but it is **necessary, not
sufficient**: "crawled, not indexed" is usually a content-value/duplication judgement, so a
few links may help re-crawl but will not deterministically flip 150 thin templated pages.
Treat the goal as "monitor whether the not-indexed pile shrinks", not "links will flip it".

On-page fundamentals are in place (mode-aware titles, full timetables, FAQ + breadcrumb +
now ItemList JSON-LD, sitemap, internal links), but on-page is **not** "done": content
depth / de-duplication is the lever most likely to move the indexing wall (section 4).

---

## Before any outreach (preconditions)

- [x] **Prod isochrones are healthy** (checked 24 Jun: a Maksimir-area click renders 25 km²
      reaching 10/17 districts, clearly transit, not walk-only).
- [x] **Source attribution shipped** to the footer (`© openstreetmap` → openstreetmap.org/copyright,
      `zet gtfs · rt` → zet.hr, `dzs 2021` → dzs.gov.hr). Wikipedia editors and data
      journalists are copyright-sensitive; an unattributed data pitch is the irony a
      fact-checker publishes.
- [ ] **Confirm ZET's actual GTFS licence** before stating one anywhere (the footer now
      credits + links zet.hr, which is safe; do not assert a licence name until verified).
- [ ] **Data is ~3 months stale** (`district-scores.json` generatedAt 2026-03-21; page stamps
      "ožujak 2026."; regen PR #14 unmerged). Either merge PR #14 so prod serves fresh data,
      or soften "live" to "na temelju voznog reda iz ožujka 2026." in the pitch. A reporter
      screenshotting a March stamp under a June story looks careless.
- [ ] **Re-verify the hardcoded pitch numbers** (7,4x / 95,6 / 12,8 / 139 / 645 / the named
      best+worst districts) against the regenerated JSON before each send. They are computed
      at build time and the named extremes can change on a feed roll.

---

## 1. hr.Wikipedia external links: high authority, but COI-compliant only

**Reality check (this was wrong before):** Mislav owns doseg.hr, so adding the domain
yourself is a conflict of interest (WP:COI / WP:ELNO / WP:SPS). Self-adding the same domain
across many articles, especially with "make it stick" tactics, is exactly what gets a domain
**globally spam-blacklisted across all of Wikimedia**, the opposite of the goal. Do not do it.

**Correct mechanism:**
1. Create a Wikipedia account and **disclose the affiliation** on your user page ("I am the
   author of doseg.hr").
2. For each candidate article, post on its **Talk page** (or use `{{edit request}}`)
   proposing the external link, explaining what it adds that the article lacks (live
   timetable + stops + the reach/isochrone map), and let an **independent editor** decide.
3. **Cut from ~15 to 1-2 best-fit articles.** Pick the hub `Tramvajski prijevoz u Zagrebu`
   (its `Vanjske poveznice` currently holds a single, stale ZET link) and at most one strong
   per-line article. **Treat 0 accepted links as a realistic, fine outcome.**

**Eligible targets (all confirmed to exist):**
- Hubs: `Tramvajski prijevoz u Zagrebu`, `Javni prijevoz u Zagrebu`, `Zagrebački električni tramvaj`
- Tram per-line: `Tramvajska linija br. N u Zagrebu` (N = 1-9, 11-15, 17; first-wave 2/6/11/17 confirmed real)
- **Bus per-line DO exist** (correcting the earlier false claim): `Autobusna linija br. N u Zagrebu`,
  including your biggest near-wins `124` (already has a `Vanjske poveznice` section), 149, 208, 241.
  So the near-win bus pages CAN be proposed as direct, topically-exact links, but through the
  same Talk-page/edit-request route, not a self-add sweep.

**Neutral Croatian link text to propose** (no marketing language):
```
* [https://doseg.hr/linije/124 Vozni red, stanice i karta dosega autobusne linije 124 (Doseg)]
```

---

## 2. Off-Wikipedia link levers (durable, no journalist needed): do these first

These are the highest-ROI, lowest-risk links, and they directly help the **bus** near-wins.
You already serve `district-scores.json` with Dataset / DataDownload JSON-LD.

- **Open-data registries:** submit the dataset to **data.gov.hr**, the **Mobility Database**
  and **transit.land** (as a Zagreb GTFS-derived source). High-DA, topically exact.
- **GitHub awesome-lists:** PR doseg into `awesome-transit`, `awesome-gtfs`, `awesome-croatia`.
- **OpenStreetMap:** add `website=https://doseg.hr/linije/N` (and/or a Wikidata link) on the
  ZET route relations for 124 / 149 / 208 / 241. Reaches the exact entities behind those queries.
- **Google Dataset Search:** make sure the Dataset JSON-LD qualifies so the open-data file is
  discoverable.

---

## 3. /statistika as link-bait → Croatian data journalism

**Frame it as a funnel, not a guarantee.** Cold data-pitch conversion is low single digits and
several outlets use nofollow: pitching ~10 desks may yield **0-2 stories, and not every story
includes a followed link**. /statistika has ~zero search volume, so its job is to *earn links*,
not traffic.

**Verified hooks** (data-wired AND rendered on the live page, so the click-through matches):
- **7,4x gap:** Donji grad reaches 95,6 km² in 30 min; Podsljeme 12,8 km². Same ticket
  **(0,53 € kiosk/app; 0,80 € kod vozača)**, same 30 minutes. (Fare current per zet.hr.)
- **More stops ≠ more reach:** Sesvete has the most people (70.800) and most stops (313), yet
  ranks **15th of 17** (score 17/100). Add the relativity caveat so it cannot be called
  circular: *bod je relativan, Donji grad = 100 po definiciji*. (Brezovica is tied at 17 in
  16th; mention if a journalist probes the full ranking.)
- **It starts before you board:** average walk to a stop is ~139 m in the centre vs ~645 m at
  the edge. [Pristup section]
- **Evening collapse is geographic (corrected):** the **eastern edge** loses most after dark
  (Novi Zagreb-istok 32%, Peščenica 30%, Donja Dubrava 28%) while the **western edge barely
  moves** (Podsused 4%, Stenjevec 7%). Donji grad's 17% is mid-pack (rank 6), so do NOT frame
  it as "drops least in the centre"; the page itself says the low-drop districts are
  peripheral. Quote the live numbers, do not hardcode.

> ⚠️ Traps:
> 1. Fare is **0,53 €**, never "10 €" (a dead figure from an old draft).
> 2. Do NOT use the "inequality worse than for wages / income-Gini" angle: verified FALSE
>    (reach Gini 0,26 < income ~0,29) and absent from /statistika. **But** note: one click away,
>    `/statistika/podaci` shows the reach-Gini 0,26 next to an *unsourced* "European cities
>    0,25-0,35" line. Source or remove that line, and brief any journalist to read the Gini as
>    transit-reach (moderate), not income inequality.
> 3. Only pitch what is visible on /statistika (no transit-desert %, no "160k people").

**Targets:** Gradonačelnik.hr (local governance, best fit), Telegram.hr, Index.hr (Zagreb
desk), Faktograf.hr, H-Alter.org, Lupiga.com, zgportal.com, Bauštela.org; tech/data:
Netokracija.com, Bug.hr / Zimo, Forbes Hrvatska.

### Draft pitch email (Croatian, no em-dashes)

> **Predmet:** Podatkovna priča: ista karta, 7,4x razlike u dosegu zagrebačkog prijevoza
>
> Pozdrav [ime],
>
> radim na Dosegu (doseg.hr), besplatnom alatu koji mjeri koliko grada možete obići javnim
> prijevozom za 30 minuta iz svakog kvarta Zagreba. Iz podataka je ispala priča za koju mislim
> da bi zanimala vaše čitatelje:
>
> - Iz Donjeg grada za pola sata dosegnete **95,6 km²** grada, iz Podsljemena samo **12,8 km²**,
>   uz **istu kartu (0,53 €) i istih 30 minuta**. Razlika je **7,4x**.
> - Sesvete imaju **najviše stanovnika (70.800) i najviše stanica (313)**, ali su tek **15. od
>   17** kvartova po dosegu. Više stanica ne znači više grada. (Bod je relativan: Donji grad =
>   100 po definiciji, ostali se mjere prema njemu.)
> - Razlika počinje prije ulaska u prijevoz: prosječna šetnja do stanice je oko 139 m u
>   Donjem gradu, a oko 645 m u Podsljemenu.
>
> Sve brojke i interaktivne karte su na doseg.hr/statistika, izvedene iz službenog ZET GTFS
> voznog reda (ožujak 2026.) uz OpenStreetMap (ODbL) i popis stanovništva DZS 2021. Rado
> pošaljem grafike u punoj rezoluciji ili pripremim izvod po kvartu za vaš tekst.
>
> Lijep pozdrav,
> Mislav, doseg.hr

**Press kit:** 2-3 hi-res graphics (two-stub ticket comparison, Sesvete paired-bar, district
ranking), one-line methodology (ZET GTFS + OSM, 200 m cells, 30-min isochrone, relative 0-100
score), source attribution, and a permalink to /statistika.

---

## 4. On-page / content levers still open (code, in our control)

- [x] **Line-level structured data shipped** (`ItemList` of stops via `lineStopsJsonLd`) so
      Google can model the route entity behind "autobus 124 vozni red / stanice".
- [x] **Hero image alt text shipped** for line/stop/kvart heroes (`Karta autobusne linije 124
      u Zagrebu` etc.) so the unique baked maps can rank in Google Images.
- [x] **/stanice added to the global nav** (was depth-4, reachable only via breadcrumbs; the
      stop pages already set `active="stanice"` so the highlight was broken too).
- [ ] **Content depth / de-duplication** is the real lever for the not-indexed pile. The 154
      line + ~1230 stop pages are template-generated and the repo flags long-tail single-line
      stops as thin. Give priority pages unique above-the-fold text + per-line stat callouts +
      varied FAQ; consider noindex/pruning the weakest long-tail stops; check the "duplicate
      without user-selected canonical" bucket in GSC.
- [ ] **Technical-SEO baseline:** run Lighthouse/PageSpeed on a line page, /statistika and
      home (map-heavy app: heroes, /api/og, karta-tramvaja). Mobile LCP/INP/CLS is a plausible
      co-cause of crawled-not-indexed; fix before assuming links alone lift indexing.

---

## 5. Position-vs-indexing question: SETTLED 25 Jun (near-wins are indexed)

Checked GSC **Performance → Pages** (7h-fresh): each near-win line page serves impressions
for **its own URL**, not a hub proxying. `/linije/241` 344 imp, `/linije/124` 322, `/linije/149`
271, `/linije/208` 261, `/linije/129` 213, `/linije/119` 216, `/linije/219` 203, `/linije/284`
113, plus `/linije` 249, `/statistika` 162. At least ~13 distinct pages serve impressions, so
the **"3 indexed" Pages report is conclusively stale** (frozen at "last update 12 Jun", never
refreshed). You cannot get impressions for an unindexed URL.

**Conclusion:** the near-win bus pages are indexed + serving but stuck at **position 6-9**
(124 @ 7.9, 149 @ 7.0, 208 @ 7.2, 241 @ 7.1). For these pages the wall is **position, so
authority/links is the correct lever** — the outreach focus is validated. The broader indexing
wall still applies to the long tail (~21 crawled-not-indexed + thin stops); content depth
(section 4) is its lever, not links.

Caveats worth noting before pitching:
- **`/linije/284` is the current top page** (6 clicks, CTR 5.3%, pos 6.3).
- **`/statistika` is NOT zero-search-volume** (162 imp, 4 clicks, pos 7.7) — it earns links AND
  some direct traffic; don't dismiss it as pure link-bait.
- Trust **Performance → Pages** for indexing state, not the Pages report (which lags ~2 weeks).

---

## Measure (dated baseline + a real loop)

- Snapshot a **dated baseline now** (impressions + position per target query; indexed-URL count).
- **UTM-tag every outreach link** and set Plausible goals (Plausible is installed but unused).
- Define a threshold + fallback (e.g. "indexed URLs up and ≥1 target query at pos ≤5 within 6
  weeks, else revisit the indexing wall").
- GSC → Links: confirm Wikipedia/editorial/registry links register as referring domains.
