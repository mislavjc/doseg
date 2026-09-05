# Schematic tram map (`/karta-tramvaja`)

A London-Underground style diagram of the tram network: straightened corridors,
named interchanges, one colour per line, with a legend of all 15 day lines.
Unlike `/karta` this is a drawing, not a routing surface.

Static tier.

## Sub-features

- **Diagram** - h1 `Karta tramvajskih linija`, an SVG schematic over a canvas
  layer, with river label `SAVA` and station labels
  (`Črnomerec`, `Trg bana J. Jelačića`, `Kvaternikov trg`, `Dubec`, ...).
- **Zoom** - `+` and `−` buttons.
- **Legend** - h2 `Tramvajske linije`, one row per line
  (`1 Zapadni kolodvor – Borongaj`, `2 Črnomerec – Savišće`, ...). The rows are
  **buttons, not links**: clicking one highlights that line and dims the rest
  to opacity 0.35. Nothing navigates and the URL does not change.

## How to get to it (user POV)

Linked from line pages and the tram sections of the imenik; not in the main
nav. Also a search-engine landing page.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

.claude/skills/verify-doseg/scripts/snap.sh /karta-tramvaja --wait "Karta tramvajskih linija" --settle 2500 --full

# The diagram must actually have geometry, not an empty frame.
ab eval 'JSON.stringify({svg: document.querySelectorAll("svg").length, canvas: document.querySelectorAll("canvas").length, paths: document.querySelectorAll("svg path").length})'

# Station labels are part of the drawing.
ab eval '["Črnomerec","Trg bana J. Jelačića","Dubec"].map(n => document.body.innerText.includes(n))'

# Legend highlight: the picked line stays opaque, the others dim.
ab find role button click --name "6 Črnomerec – Sopot"
ab wait 1000
ab eval '[...document.querySelectorAll("button")].filter(b=>/Sopot|Savišće/.test(b.textContent)).map(b=>[b.textContent.trim().slice(0,12), getComputedStyle(b).opacity])'
# [["6Črnomerec – ", "1"], ["2Črnomerec – ", "0.35"], ["3Ljubljanica –", "0.35"]]
ab screenshot tmp/verify/tram-highlight.png
```

## Gotchas

- The schematic is hand-tuned geometry, not generated from GTFS. A line that
  looks wrong after a feed roll is a drawing to update, not a data bug.
- **`textContent` and the accessibility name disagree here.** The DOM reads
  `6Črnomerec – Sopot`, the accessibility name is `6 Črnomerec – Sopot` with a
  space. `find role button --name` wants the spaced form; an `ab eval` over
  `textContent` sees the other. When a name match fails, the error lists the
  names actually seen: use that list.
- Screenshot after a settle: the canvas layer paints a frame later than the
  DOM.
- The line colours here follow the schematic's own palette, still token-driven
  in `app/globals.css`. Do not introduce raw hex to make a line stand out.
- **This page does not follow the site design system**, and it is the only one:
  a colour per line rather than one blue, legend rows computing to
  `font-size: 13px` (the system allows 16px and 12px only) and
  `border-radius: 16px` (the system is sharp everywhere). Whether that is a
  deliberate exemption for a transit diagram or drift is Mislav's call, so
  measure and report it rather than "fixing" it on your own:
  `ab eval '[...document.querySelectorAll("button")].slice(0,3).map(b=>[getComputedStyle(b).fontSize, getComputedStyle(b).borderRadius])'`
