# Verse of the Day — Urdu & English

A bilingual, installable Progressive Web App that shows today’s Bible verse in Urdu and English.

**Live site:** [https://sgeorge83.github.io/VOTD-URDU-ENGLISH/](https://sgeorge83.github.io/VOTD-URDU-ENGLISH/)

## Features

- Urdu verse text (RTL) with Noto Nastaliq Urdu
- English verse text (LTR) below
- Reference in English and Urdu, plus the verse date
- Copy and Share actions
- Offline-friendly shell via service worker
- Dark glass-card UI, mobile-first

## API

The app reads from:

```
GET https://urdu-bible-api.vercel.app/votd?include_english=true
```

No backend is required in this repository.

## Local preview

Serve the folder with any static file server, for example:

```bash
npx serve .
```

Then open the printed local URL in your browser.

## Deploy (GitHub Pages)

Pushes to `main` deploy automatically via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

**One-time setup:**

1. GitHub → **Settings** → **Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main` (or run the workflow manually under **Actions**)

The site will be live at the URL above after the workflow finishes.

## Credits & licenses

- **Brand:** E-GEEK CREATIONS
- **English reference:** [labs.bible.org](https://labs.bible.org/) (NET Bible)
- **Urdu text:** Urdu Geo Version — [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)
