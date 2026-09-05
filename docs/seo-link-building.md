# SEO authority + link-building plan for doseg.hr

> Audited by a 20-agent adversarial review (24 Jun 2026). **Re-verified end-to-end 8 Aug 2026**:
> the framing below was rewritten (the June "two walls" model is obsolete) and **every pitch
> number was recomputed against the live page**. All four original hooks had drifted; one had
> inverted outright. Do NOT skip "Before any outreach".

## Where things actually stand (8 Aug 2026)

GSC 28-day: **1,230 clicks / 116k impressions / CTR 1.1% / avg position 6.9** (vs 164 clicks /
15.1k impressions on 6 Jul). **1.39k pages indexed.**

**The indexing wall is gone.** The not-indexed pile is now almost entirely intentional: 1,128
blocked by robots.txt (the deliberate `?lat&lon` fix), 467 alternative-canonical, and only 26
crawled-not-indexed + 14 discovered-not-indexed. The June "two walls" framing is retired.

**On-page is genuinely done, and this was tested rather than assumed (8 Aug):**
- **Snippet wording is not the constraint.** Mobile converts at 1.0% CTR at position 6.6;
  desktop at 1.8% at position 9.0. Identical title and description on both. A wording problem
  would hurt both devices; desktop is roughly normal for its rank.
- **Query intent is not the constraint.** The "stanice queries convert 7x" reading was a
  long-tail artifact: 104 of 105 such queries have under 100 impressions. Matched by position
  band at 200+ impressions, bare-number and vozni-red queries are indistinguishable
  (0.69% vs 0.74%).
- **Fold depth is real but not the discriminator.** Measured on a 412x915 mobile viewport,
  doseg lands 1.1 to 2.5 screens down. But the *shallowest* query (`zet 272`, 1.1 screens) gets
  zero clicks while the *deepest* (`zet bus 107 stanice`, 2.5 screens) is the best converter.
- Also: a slice of bare-number impression volume is phantom. `130` reports 687 impressions at
  position 6.3, but the live SERP is US immigration forms and doseg is not on page 1. **Do not
  read the 1.1% site CTR as a failure grade.**

**Conclusion: authority is the only lever left, and it is now the whole game.** At position 6-7
on mobile, doseg sits under 2-4 competitors plus large SERP furniture (image carousels ~684px,
related-search boxes ~407px). Getting above that furniture means ranking top 1-3. 154 line pages
share one domain authority score, so a single link lifts all of them at once; on-page work has
to be done page by page.

**Ahrefs: DR 0, 2 referring domains** (one of which is spam, for an unrelated "DOSEG d.o.o.").
The single real link, bug.hr, produced a 7.5x month. That is the proof of concept.

---

## Before any outreach (preconditions)

- [x] **Prod isochrones healthy** (24 Jun: Maksimir-area click renders 25 km² reaching 10/17
      districts, clearly transit, not walk-only).
- [x] **Source attribution shipped** to the footer (openstreetmap.org/copyright, zet.hr,
      dzs.gov.hr). An unattributed data pitch is the irony a fact-checker publishes.
- [x] **ZET GTFS licence CONFIRMED** (see section 2). Safe to state.
- [x] **Data is fresh.** `district-scores.json` regenerated **13 Jul 2026** (was March). The
      page stamps "13. srpnja 2026." The old "soften the word live" workaround is no longer
      needed.
- [x] **Pitch numbers re-verified 8 Aug** against the rendered page. **All four hooks had
      drifted; the evening hook had inverted.** Corrected in section 3.
- [x] **Unsourced Gini benchmark removed** (`lorenz-gini-section.tsx`). It claimed "most
      European cities with good transit sit at 0,25 to 0,35" with nothing behind it. Replaced
      with a definitional explanation. Faktograf.hr is on the target list; do not ship an
      untraceable comparative statistic to a fact-checking desk.
- [x] **Evening-drop copy de-hardcoded** (`app/statistika/editorial/jutro.tsx`). The headline
      read "istok ostaje bez trećine grada" while the chart directly beneath it showed the
      east losing 7-12% and the *centre* losing most. Now derived from the same rows the chart
      renders, so it cannot drift again.
- [ ] **DEPLOY the two fixes above before sending anything.** They are committed to the working
      tree, not yet live. Pitching a page that contradicts itself is worse than not pitching.
- [ ] **Open risk: the `rezultati.json` download does not match the page.** The page ranks
      Podsljeme 15th / Sesvete 16th / Brezovica 17th; raw `district-scores.json` ranks Brezovica
      15th / Podsljeme 16th / Sesvete 17th (the page serves a day-filtered build, the file pools
      7 days). A journalist who downloads the data and checks it will find a discrepancy.
      Reconcile, or label the download so the difference is explicit, before pitching data desks.
- [ ] **Re-verify the numbers again immediately before each send.** They are build-time computed
      and moved substantially on the last feed roll. This checklist item is not a formality: it
      caught an inverted claim once already.

---

## 1. hr.Wikipedia external links: high authority, but COI-compliant only

**Reality check:** Mislav owns doseg.hr, so adding the domain yourself is a conflict of interest
(WP:COI / WP:ELNO / WP:SPS). Self-adding the same domain across many articles, especially with
"make it stick" tactics, is exactly what gets a domain **globally spam-blacklisted across all of
Wikimedia**, the opposite of the goal. Do not do it.

**Correct mechanism:**
1. Create a Wikipedia account and **disclose the affiliation** on your user page ("I am the
   author of doseg.hr").
2. For each candidate article, post on its **Talk page** (or use `{{edit request}}`) proposing
   the external link, explaining what it adds that the article lacks (live timetable + stops +
   the reach/isochrone map), and let an **independent editor** decide.
3. **Cut from ~15 to 1-2 best-fit articles.** Pick the hub `Tramvajski prijevoz u Zagrebu` (its
   `Vanjske poveznice` currently holds a single, stale ZET link) and at most one strong per-line
   article. **Treat 0 accepted links as a realistic, fine outcome.**

**Eligible targets (all confirmed to exist):**
- Hubs: `Tramvajski prijevoz u Zagrebu`, `Javni prijevoz u Zagrebu`, `Zagrebački električni tramvaj`
- Tram per-line: `Tramvajska linija br. N u Zagrebu` (N = 1-9, 11-15, 17)
- **Bus per-line DO exist**: `Autobusna linija br. N u Zagrebu`, including `124` (already has a
  `Vanjske poveznice` section), 149, 208, 241. These can be proposed as topically-exact links,
  through the Talk-page route, not a self-add sweep.

**Neutral Croatian link text to propose** (no marketing language):
```
* [https://doseg.hr/linije/124 Vozni red, stanice i karta dosega autobusne linije 124 (Doseg)]
```

---

## 2. Off-Wikipedia link levers (durable, no journalist needed): do these first

Researched 26 Jun. Only channels that fit a derived-analysis tool (doseg is NOT a GTFS feed) are
kept; the rest are flagged as non-fits so nobody wastes effort.

**DO these:**
- **awesome-transit (MobilityData):** `https://github.com/MobilityData/awesome-transit`. doseg
  fits the **Visualization** section (alongside BusGraphs / GTFS City). Open a PR adding,
  alphabetically:
  ```
  - [Doseg](https://doseg.hr) - Public-transport accessibility analysis for Zagreb: 30-minute
    isochrone reach scored per district, line/stop pages, and an interactive reach map. (Croatian)
  ```
- **Google Dataset Search:** eligible. The Dataset JSON-LD on `/statistika/podaci` carries
  `license` (ODbL), `keywords`, `spatialCoverage`, `isBasedOn`. Passive discovery; keep it valid.
- **Croatian civic / dev lists:** `awesome-croatia`, r/croatia and dev.hr style resource pages.
  Lower authority than awesome-transit but topically Croatian.

**SKIP (do not fit / would backfire):**
- **Mobility Database / transit.land:** catalogs of GTFS *feeds*. doseg publishes derived JSON,
  not a feed. Not applicable.
- **OpenStreetMap `website=` on route relations:** that tag is for the *operator's official*
  page (zet.hr). Third-party additions are the same COI problem as Wikipedia self-adding, and
  get reverted.
- **data.gov.hr:** primarily for tijela javne vlasti. Only pursue with a city/ZET sponsor.

### ZET GTFS licence: CONFIRMED
ZET publishes its GTFS (static + realtime) under **"Otvorena dozvola / Open Licence - Republic of
Croatia"**, attribution required to **"Zagrebački električni tramvaj d.o.o."**
(source: zet.hr/odredbe/datoteke-u-gtfs-formatu/669).
- **Attribution line for press kit / methodology:** *Podaci: ZET GTFS (Otvorena dozvola RH) +
  OpenStreetMap (ODbL) + DZS 2021; obrada: Doseg.*

---

## 3. /statistika as link-bait → Croatian data journalism

**Frame it as a funnel, not a guarantee.** Cold data-pitch conversion is low single digits and
several outlets use nofollow: pitching ~10 desks may yield **0-2 stories, and not every story
includes a followed link**.

> **All numbers below were re-read off the rendered page on 8 Aug 2026.** The June figures
> (7,4x / 95,6 km² / 12,8 km² / Sesvete 15th / 313 stops) are **all dead**. Do not reuse them
> from any older draft or email.

**Verified hooks (live on the page today):**
- **The 4,9x gap:** from the centre, 30 minutes reaches **41,0 km²**; from the edge, **8,4 km²**.
  Same ticket **(0,53 €)**, same 30 minutes. *(Was 7,4x in June.)*
- **The centre's floor beats everyone's average:** *"I najslabije povezan dio Donjeg grada
  doseže više od prosjeka svakog drugog kvarta, a u njemu živi tek 4% Zagrepčana."* Strongest
  single line on the page, and it is rendered verbatim.
- **More stops ≠ more reach (Sesvete):** most people (**70.800, 1st**) and most stops
  (**299, 1st**), yet reach **25/100, 16th of 17**. The page already carries the honest caveat:
  Sesvete is also the largest by area, so even the densest network covers only parts. Pair it
  with the relativity caveat: *bod je relativan, Donji grad = 100 po definiciji*.
  *(Was "313 stops, 15th" in June; 313 is now Stenjevec's stop count.)*
- **It starts before you board:** average walk to a stop is **139 m** in Donji grad vs **645 m**
  in Podsljeme, city average **344 m**, a **4,6x** difference.

> ⚠️ **The evening hook INVERTED. Read this before reusing anything.**
> June copy said the eastern edge loses up to a third after dark while the west barely moves.
> The live chart now shows the **centre** losing most (**Donji grad -15%, Trnje -15%,
> Trešnjevka-sjever -13%**) and the periphery least (**Brezovica -0%, Podsused -3%**). Novi
> Zagreb-istok is -12%, Peščenica -7%, Donja Dubrava -8%. Nothing loses a third.
> The defensible reading now: **the centre has the most reach to lose, the periphery is already
> near a floor.** That is a legitimate story, but it is the opposite of the old one. The page
> copy was corrected 8 Aug and is now derived from the chart data.

> ⚠️ Other traps:
> 1. Fare is **0,53 €**, never "10 €" (a dead figure from an old draft).
> 2. Do NOT use the "inequality worse than for wages / income-Gini" angle: verified FALSE and
>    absent from /statistika. Brief any journalist to read the Gini as transit-reach, not income.
>    The unsourced "European cities 0,25-0,35" line was removed 8 Aug.
> 3. Only pitch what is visible on /statistika (no transit-desert %, no "160k people").

**Targets:** Gradonačelnik.hr (local governance, best fit), Telegram.hr, Index.hr (Zagreb desk),
Faktograf.hr, H-Alter.org, Lupiga.com, zgportal.com, Bauštela.org; tech/data: Netokracija.com,
Zimo, Forbes Hrvatska.

> **Bug.hr is no longer a cold target.** Matej Markovinović published a doseg feature on
> 19 Jul 2026 (dofollow, DR 65) and it is the single link the whole current traffic base rests
> on. Treat as a **warm contact for a follow-up story** (e.g. the /promjene tracker or a Split
> and Rijeka expansion), not a cold pitch. Do not re-pitch the same angle.

### Draft pitch email (Croatian, no em-dashes)

> **Predmet:** Podatkovna priča: ista karta, 4,9x razlike u dosegu zagrebačkog prijevoza
>
> Pozdrav [ime],
>
> radim na Dosegu (doseg.hr), besplatnom alatu koji mjeri koliko grada možete obići javnim
> prijevozom za 30 minuta iz svakog kvarta Zagreba. Iz podataka je ispala priča za koju mislim
> da bi zanimala vaše čitatelje:
>
> - Iz centra za pola sata dosegnete **41,0 km²** grada, s ruba **8,4 km²**, uz **istu kartu
>   (0,53 €) i istih 30 minuta**. Razlika je **4,9x**.
> - Najslabije povezan dio Donjeg grada doseže više od prosjeka svakog drugog kvarta, a u
>   Donjem gradu živi tek **4% Zagrepčana**.
> - Sesvete imaju **najviše stanovnika (70.800) i najviše stanica (299)**, ali su **16. od 17**
>   kvartova po dosegu. Više stanica ne znači više grada. (Bod je relativan: Donji grad = 100
>   po definiciji. Sesvete su i najveći kvart po površini, pa i gusta mreža pokriva tek dijelove.)
> - Razlika počinje prije ulaska u prijevoz: prosječna šetnja do stanice je **139 m** u Donjem
>   gradu, a **645 m** u Podsljemenu, uz gradski prosjek od 344 m.
>
> Sve brojke i interaktivne karte su na doseg.hr/statistika, izvedene iz službenog ZET GTFS
> voznog reda (srpanj 2026.) uz OpenStreetMap (ODbL) i popis stanovništva DZS 2021. Rado
> pošaljem grafike u punoj rezoluciji ili pripremim izvod po kvartu za vaš tekst.
>
> Lijep pozdrav,
> Mislav, doseg.hr

**Press kit:** 2-3 hi-res graphics (ticket comparison, Sesvete paired-bar, district ranking),
one-line methodology (ZET GTFS + OSM, 200 m cells, 30-min isochrone, relative 0-100 score),
source attribution, permalink to /statistika.

---

## 4. On-page / content levers: CLOSED

- [x] **Line-level structured data** (`ItemList` of stops via `lineStopsJsonLd`).
- [x] **Hero image alt text** for line/stop/kvart heroes.
- [x] **/stanice in the global nav.**
- [x] **Indexing resolved** (1.39k indexed; the remaining not-indexed is intentional). The June
      "content depth to fix the not-indexed pile" item is **moot** and was retired 8 Aug.
- [~] **Route endpoints in line-page titles.** Every competitor SERP title carries them
      (zet.hr, bus.hr, Moovit, Wikipedia); doseg's does not, and `[broj]/page.tsx` keeps them
      out deliberately. Verified it *would* fit: median 41 chars, longest 55, none over 60.
      **But the device split shows snippet wording is not the CTR constraint**, so there is no
      evidence this moves anything. Cost is a 62-name terminal-expansion map (many GTFS names
      are abbreviated: `Kvat. trg`, `Ses.Kraljev.`, `Britan. trg`) plus 6 circular lines where
      both terminals are identical. **Treat as a low-confidence experiment on a subset with a
      measured before/after. Do not fund the expansion map on SEO grounds alone.**
- [ ] **Technical-SEO baseline:** Lighthouse/PageSpeed on a line page, /statistika and home.
      Worth a pass on its own merits, no longer suspected as an indexing co-cause.

---

## 5. What the data settled

- **Indexing vs position: settled.** Indexing is done. Position is the remaining wall, and
  position is a function of authority.
- **CTR: investigated and closed 8 Aug.** Snippet wording, query intent and fold depth were each
  tested and each failed to explain the pattern. No on-page CTR lever was found. Full working in
  the `seo-gsc-baseline` memory, including the refuted hypotheses, so this does not get
  re-derived.
- **Trust Performance → Pages for indexing state**, not the Pages report (which lags).

---

## Measure (dated baseline + a real loop)

- **Baseline, 8 Aug 2026:** 1,230 clicks / 116k impressions / CTR 1.1% / position 6.9;
  1.39k indexed; Ahrefs DR 0, 2 referring domains; Plausible 7-day 409 uniques, ~73% Google.
- **UTM-tag every outreach link** and set Plausible goals (installed but unused).
- Threshold + fallback: **≥1 new referring domain at DR 30+ within 6 weeks**, and watch whether
  average position moves off 6.9. If two months of outreach yields no links, the bottleneck is
  the pitch, not the plan.
- GSC → Links: confirm any editorial/registry link registers as a referring domain.
