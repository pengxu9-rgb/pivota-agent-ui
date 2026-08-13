# Self-hosted fonts

These are the exact `latin`-subset **variable** font files Google Fonts serves,
vendored so `next build` never reaches the network.

## Why

`next/font/google` downloads font files from `fonts.gstatic.com` **at build
time**. A transient network failure in the build container therefore fails the
whole build. That is precisely what broke the production deploy of PR #301 —
six `Failed to fetch font file` errors against `fonts.gstatic.com`, reported
against `src/app/layout.tsx`, in a PR that never touched fonts. The failure is
random, so it can hit any PR at any time; self-hosting removes the dependency.

## Provenance

Fetched from the Google Fonts CSS API v2 with a modern-browser UA (which is what
selects `woff2`), taking the `/* latin */` block of each family:

| file | family | axes | source |
|---|---|---|---|
| `Newsreader-latin-variable.woff2` | Newsreader 16pt (Regular) | `wght 200..800`, `opsz 6..72` | `css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800` |
| `Newsreader-latin-variable-italic.woff2` | Newsreader 16pt (Italic) | `wght 200..800`, `opsz 6..72` | same |
| `Geist-latin-variable.woff2` | Geist | `wght 100..900` | `css2?family=Geist:wght@100..900` |
| `GeistMono-latin-variable.woff2` | Geist Mono | `wght 100..900` | `css2?family=Geist+Mono:wght@100..900` |

Axes above were verified by reading each file's `fvar` table, not assumed — in
particular Newsreader's `opsz` axis is intact, which `layout.tsx` relies on for
`font-variation-settings`.

## Licensing

Geist, Geist Mono and Newsreader are all licensed under the **SIL Open Font
License 1.1**, which explicitly permits redistribution and self-hosting. See
`OFL.txt`.

## Refreshing

Only needed if a family should be updated (Google's file URLs are versioned, so
these files are stable and will not drift on their own):

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -A "$UA" "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap"
# take the woff2 URL from the /* latin */ block, then curl -A "$UA" <url> -o <file>
```

After refreshing, re-verify the axes before committing:

```bash
python3 -c "from fontTools.ttLib import TTFont; t=TTFont('Geist-latin-variable.woff2'); print([(a.axisTag,a.minValue,a.maxValue) for a in t['fvar'].axes])"
```
