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

1. Push this repository to `main`.
2. In GitHub → **Settings** → **Pages**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/ (root)**.
4. Save. The site will be available at the URL above after the workflow completes.

## Credits & licenses

- **Brand:** E-GEEK CREATIONS
- **English reference:** [labs.bible.org](https://labs.bible.org/) (NET Bible)
- **Urdu text:** Urdu Geo Version — [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)
