# Note Reading Trainer

Nota Nota is a bilingual, mobile-friendly treble-clef note-reading trainer. It
helps learners build fluency with natural notes through short, shuffled practice
sessions in Turkish or English.

## Development status

The core trainer is functional. It includes all three ranges, both question
styles, retry-until-correct sessions, and end-of-session statistics. The visible
application runs entirely in the browser and is compatible with static hosting.

## Main features

- Three practice ranges: notes on the staff, nearby ledger lines, and middle C
  through high C
- Staff-reading and written-position question styles
- Turkish solfege names and standard English letter names
- A uniquely populated, newly shuffled queue for every session
- Incorrect notes returned to the queue until answered correctly
- First-attempt accuracy, response-time, and review statistics
- Responsive layouts and touch-friendly controls for phones and tablets
- Locale preference stored in the browser; `?lang=tr` and `?lang=en` are also
  supported

## Local development

Requires Node.js `>=22.13.0` and npm.

```bash
npm ci
npm run dev
```

The default development command uses the existing Vinext and Cloudflare Vite
integration.

## Production builds

Build the existing Vinext/Cloudflare application:

```bash
npm run build
```

Build the static GitHub Pages application:

```bash
npm run build:pages
npm run test:pages
```

The Pages build is written to `out-pages/`. It is generated output and is not
committed.

## GitHub Pages deployment

Pushes to `main` trigger `.github/workflows/deploy-pages.yml`. The workflow
installs locked dependencies, runs lint and tests, builds the static frontend,
validates the output, uploads `out-pages/`, and deploys it with GitHub's official
Pages actions.

Primary live site:
[https://notanota.online/](https://notanota.online/)

GitHub Pages fallback:
[https://alperferitko.github.io/note-reading-trainer/](https://alperferitko.github.io/note-reading-trainer/)

GitHub Pages serves only static frontend files. The repository also preserves
optional Vinext server rendering, Cloudflare Worker, D1/Drizzle, and ChatGPT
authentication helpers, but those server-side capabilities are not included in
the Pages build. The current note trainer does not depend on them, so its intended
practice behavior remains available on GitHub Pages.
