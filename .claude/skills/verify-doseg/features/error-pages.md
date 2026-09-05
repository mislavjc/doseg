# Error pages (404 and 500)

A deliberate design: the error page reads as a severed route line, with stops
rendered as links onward and a retry on the 500. Every unknown line, stop,
kvart or address slug lands here, so it is a real user-facing surface, not a
fallback nobody sees.

Static tier.

## Sub-features

- **404** (`app/not-found.tsx`) - eyebrow `greška 404`, h1
  `Ova stanica ne postoji.`, the line
  `Stranica je premještena ili nikad nije postojala. Trasa ide dalje, izaberi
  stanicu koja postoji.`, and stop links `početna`, `statistika`, `sve linije`.
- **Status codes** - `/linije/999999`, `/stanice/nema-me`, `/kvartovi/nema-me`
  and an unresolvable address slug all return HTTP 404 with that page.
- **500** (`app/error.tsx`, `app/global-error.tsx`) - the same route-line
  design with a retry action.

## How to get to it (user POV)

A stale link from search results after a slug changes, a mistyped URL, or a
pruned slug after a feed roll (the regen pipeline deletes orphan pages).

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

# The status code matters as much as the page: a soft 404 would poison search.
for u in /linije/999999 /stanice/nema-me /kvartovi/nema-me /adresa/nema-me; do
  curl -sk -o /dev/null -w "$u %{http_code}\n" "https://doseg.localhost$u"
done

.claude/skills/verify-doseg/scripts/snap.sh /linije/999999 --wait "Ova stanica ne postoji" --name not-found

# The onward links have to work, that is the whole point of the design.
ab open https://doseg.localhost/linije/999999
ab eval '[...document.querySelectorAll("main a")].map(a=>[a.textContent.trim(), a.getAttribute("href")])'
ab find role link click --name "sve linije"
ab wait --url "**/linije"
```

## Gotchas

- **The 500 page has no natural trigger.** Verifying it means temporarily
  throwing from a server component (or a client render) and reverting straight
  after. Do that on a scratch branch, never leave the throw behind, and drive
  it in the same session so the evidence is real rather than a mockup.
- 404s are the expected outcome of the pruning step in the regen pipeline. When
  a slug that used to work now 404s, check whether the feed roll removed it
  before treating it as a bug; the fix is usually a redirect, not resurrection.
- The error page uses the same header and footer as the rest of the site, so a
  layout regression shows up here too. It is a cheap page to screenshot after
  shared-chrome changes.
