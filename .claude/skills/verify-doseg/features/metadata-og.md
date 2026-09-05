# Machine-facing surfaces (OG cards, llms.txt, sitemap, robots, JSON-LD)

Not pages a visitor browses, but the parts of the site other machines read:
the OG card a shared link renders, the JSON-LD that produces rich results, the
sitemap and robots rules, and `/llms.txt` for agents. On a pSEO site these are
the feature, not decoration, and none of them are covered by `bun test`.

Static tier.

## Sub-features

- **OG cards** (`/api/og`) - satori-rendered 1200x630 PNGs.
  `/api/og?naslovnica` is the homepage card; `/api/og?lat&lon&time` renders the
  shared-map card with the clicked district. `/karta` without coordinates uses
  the static `/og.jpg` instead.
- **JSON-LD** - a line page carries `WebSite`, `FAQPage`, `BreadcrumbList` and
  `ItemList`. Stop, kvart and editorial pages compose theirs from the shared
  `editorial/json-ld` kit.
- **`/llms.txt`** - built dynamically (it reads mounted `./data`), English
  prose pointing agents at the Croatian pages, with no headings inside the
  prose block.
- **`/sitemap.xml`** - about 1,400 `<url>` entries today.
- **`/robots.txt`** - allows `/api/open-data`, disallows the rest of `/api/`
  and the crawl-leaking `?lat=` map URLs.
- **Metadata** - title, description and canonical on every pSEO template, via
  `lib/pseo-metadata.ts`.

## How to get to it (user POV)

Nobody clicks these. They surface as a link preview in a chat app, a Google
result, or an agent answering a question about Zagreb transport.

## Driving it with agent-browser

```bash
source .claude/skills/verify-doseg/scripts/session.sh

# OG cards: check the bytes, then look at the image.
curl -sk "https://doseg.localhost/api/og?naslovnica" -o tmp/verify/og-naslovnica.png -w "%{http_code} %{content_type}\n"
curl -sk "https://doseg.localhost/api/og?lat=45.8131&lon=15.9775&time=08:00" -o tmp/verify/og-karta.png
file tmp/verify/og-*.png     # PNG image data, 1200 x 630

# JSON-LD actually parses and has the expected types.
ab open https://doseg.localhost/linije/1
ab eval '[...document.querySelectorAll("script[type=\"application/ld+json\"]")].map(s=>JSON.parse(s.textContent)["@type"])'
# ["WebSite", "FAQPage", "BreadcrumbList", "ItemList"]

# Head metadata on a pSEO page.
ab eval 'JSON.stringify({title: document.title, desc: document.querySelector("meta[name=description]")?.content, canonical: document.querySelector("link[rel=canonical]")?.href, og: document.querySelector("meta[property=\"og:image\"]")?.content})'

# Text surfaces.
curl -sk https://doseg.localhost/llms.txt | head -20
curl -sk https://doseg.localhost/robots.txt
curl -sk https://doseg.localhost/sitemap.xml | grep -c "<url>"
```

Look at the OG PNG, do not just check its status: satori fails by rendering
something wrong, not by 500ing.

## Gotchas

- **Satori crashes on an undefined style value**, so an OG regression usually
  appears as a 500 from `/api/og` after a refactor that dropped a style prop.
- **Satori cannot resolve CSS variables.** `app/api/og/*.tsx` mirrors the token
  values with a comment pointing back at `:root`; when a token changes, both
  places change.
- OG cards are the sanctioned exception to the two-font-size rule: 32px Heros
  Bold and 24px Geist Mono on a 600x315 layout shipped at 2x.
- `/api/og` is **not** edge-cached by Cloudflare in production, so a slow card
  is a real user-facing cost.
- `/llms.txt` stays a dynamic route because it reads mounted `./data`; do not
  "optimise" it into a static file. Its spec forbids headings in the prose
  block, and `bun test` covers the builder.
- `robots.txt` disallows `?lat=` deliberately: those URLs leaked into the index
  once. Do not relax it without a reason.
- Sitemap size tracks the generated page count. A sudden drop after a feed roll
  means slugs were pruned; check that before shipping.
