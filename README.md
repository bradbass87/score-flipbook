# score-flipbook

Self-hosted flipbook widget for displaying music scores on Squarespace (or any site).
Replaces per-widget services like Elfsight Flipbook — no seats, no accounts, no cost.

Built on two free libraries loaded from jsDelivr at runtime:

- [page-flip / StPageFlip](https://github.com/Nodlik/StPageFlip) (MIT) — page-turn animation
- [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) — optional PDF mode

## How it works

Each score is converted **once** from PDF to page JPEGs (150 dpi) that live in
`scores/<slug>/` in this repo, served by GitHub Pages. The flipbook loads those
images — the print-quality PDF itself is never published (PDFs are gitignored here).

## Embedding a score in Squarespace

Add a **Code Block** where the flipbook should appear and paste:

```html
<script src="https://bradbass87.github.io/score-flipbook/flipbook.js" defer></script>
<div class="score-flipbook"
     data-pages="https://bradbass87.github.io/score-flipbook/scores/SCORE-SLUG/page-{nn}.jpg"
     data-count="16"></div>
```

`{nn}` is replaced with the zero-padded page number; `data-count` is the number of
pages. Multiple flipbooks per page work fine (duplicate script tags are harmless).

### Optional attributes

| Attribute | Default | What it does |
|---|---|---|
| `data-height` | `640` | Max height of the book area in px |
| `data-pdf` | — | PDF mode: render a PDF directly instead of images (see below) |
| `data-scale` | `2` | PDF mode render scale |

## Adding a new score

```sh
./convert-score.sh "path/to/New Score.pdf" new-score-slug   # needs: brew install poppler
git add scores/new-score-slug && git commit -m "Add new-score-slug" && git push
```

The script prints the exact embed snippet to paste into Squarespace. Pages
redeploys automatically in about a minute.

## PDF mode and the Squarespace CORS problem

The widget also supports `data-pdf="…url…"` which renders a PDF in the browser.
This requires the PDF host to send CORS headers. **PDFs uploaded to Squarespace do
not work**: `/s/file.pdf` links 301-redirect to `static1.squarespace.com`, which
sends no `Access-Control-Allow-Origin` header, so the browser blocks the fetch.
GitHub Pages URLs work fine. This is why image mode is the default workflow.

## Local development

```sh
python3 -m http.server 8642
# open http://localhost:8642
```

`index.html` is a demo page that doubles as a test harness for both modes.
