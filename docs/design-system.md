# Statistika — design system (locked)

The flat / halftone / 84F redesign. When porting to code, these are CSS-variable values.

## Type — exactly two sizes
- **16px** · TeX Gyre Heros · all prose, headings, hooks, stat numbers. Hierarchy from **weight** (400 / 700) + colour + space, never size. No big display numbers.
- **12px** · Geist Mono · all labels, eyebrows, nav, TOC, footer meta, data cells/scores (tabular). (Replaced the old 13px — 16/12 is the clean pair.)
- No serif. No third size.

## Colour
- ink `#0A0A0A` · body `#2A2F35` · muted `#6A7178` · faint `#9AA0A6`
- ground `#FFFFFF` · hairline `#ECEEF0` / `#E4E7EA`
- accent (Zagreb blue) `#0E51C9` · ranking band ramp `#0E3FB0`→`#F4F8FE` (navy→pale by score)
- LED amber `#FF7308` retained only for the (now-unused) departure-board variant

## Spacing — 8px base
- **Section vertical padding: 80px** (top & bottom) → consistent rhythm between sections.
- Horizontal page padding: 64px (desktop) / 16px (mobile).
- Content column gap (block→block): **20px**.
- Tight pair (eyebrow→heading): **8px**.
- Content widths, centered: article ~**620px**; data sections (map + bands) ~**800px**.

## Components
- **Nav** — contained (~640px, text-column width), absolutely positioned over the hero; **ASCII corner brackets** `⌜ ⌝ ⌞ ⌟`; logo (3D halftone map mark, variant "D") + mono links.
- **Hero map** — full-bleed, figure-ground halftone of central Zagreb (`e_hero.png`; see [[zagreb-dither-map-pipeline]]). **Unified header band** (Paper "Nav unifikacija — U3"): one 400px band (340px mobile) on every page, nav 56px from the top; pages differ only by map crop (statistika `center 46%` Donji grad, o-projektu `center 70%` park belt).
- **Ranking (ljestvica)** — full-width colour bands by score, **sharp corners**, **regular-weight tabular mono scores**, centered (~420px band col beside the halftone 3D map + mono stats).
- **Ticket** — original ZET photo, **untouched** (no baked price), small, centered, tilted `-2.5deg` + soft shadow. Section header.
- Sharp corners everywhere (no border-radius on data blocks).

## TODO to fully apply
- [ ] sweep remaining 13px → 12px in the ranking band rows + mono stats + footer values (did eyebrows/TOC/nav)
- [ ] apply 80px section rhythm to the mobile page
- [ ] real ranking numbers/order (see [[nejednakost-section]] data block)
