<div align="center">

# ♪ Nota Nota

**A bilingual, mobile-first treble-clef note-reading trainer built for short, focused practice.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-EA5A42?style=for-the-badge&logo=github)](https://notanota.online/)
[![React](https://img.shields.io/badge/React-19-182D28?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-182D28?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Languages](https://img.shields.io/badge/Languages-TR_%2F_EN-EA5A42?style=for-the-badge)](#language-support)

[Try the live demo](https://notanota.online/) ·
[Features](#features) ·
[Run locally](#local-development) ·
[Contributing](#contributing)

</div>

![Nota Nota shown on desktop and mobile](./docs/nota-nota-preview.jpg)

## About

**Nota Nota** helps learners recognize natural notes on the treble clef quickly and accurately.

Each practice session starts with a shuffled queue containing every selected note position exactly once. Correct answers leave the queue. Incorrect answers are moved to the end and return later, so a session finishes only after every note has been answered correctly.

The result is a simple practice loop built around recognition, correction, and repetition.

## Features

- Three progressive treble-clef practice ranges
- Visual staff-reading and written-position question modes
- Turkish solfege names and English letter names
- A newly shuffled question order for every session
- Automatic repetition of incorrectly answered notes
- First-attempt accuracy and response-time statistics
- Responsive, touch-friendly desktop and mobile layouts
- Browser-stored language preference
- Fully static GitHub Pages build

## Practice ranges

| Level | Range | Notes |
|---|---|---:|
| **1** | Five staff lines and four spaces | 9 |
| **2** | Staff, adjacent spaces, and nearest ledger lines | 13 |
| **3** | Full natural range from middle C to high C | 15 |

## Practice modes

### Read the staff

A note is displayed on the treble clef. Type its name before moving to the next question.

### Read the position

A written staff position is shown. Identify the natural note that belongs there.

## How a session works

1. Choose a practice range.
2. Choose a question style.
3. Answer each shuffled note.
4. Correct answers are completed for the session.
5. Incorrect answers return at the end of the queue.
6. Review accuracy, timing, and missed notes after the session.

## Language support

| Interface | Note names |
|---|---|
| **Türkçe** | Do, Re, Mi, Fa, Sol, La, Si |
| **English** | C, D, E, F, G, A, B |

The selected language is saved in the browser. It can also be set directly with:

```text
?lang=tr
?lang=en
```

## Tech stack

- **React 19**
- **TypeScript**
- **Vinext**
- **Vite**
- **GitHub Actions**
- **GitHub Pages**

The repository also preserves optional Cloudflare Worker and Drizzle-related infrastructure. The public trainer itself runs entirely in the browser and does not require a server or database.

## Local development

### Requirements

- Node.js `22.13.0` or newer
- npm

### Installation

```bash
git clone https://github.com/alperferitko/note-reading-trainer.git
cd note-reading-trainer
npm ci
npm run dev
```

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Vinext development server |
| `npm run lint` | Run ESLint |
| `npm test` | Build and run trainer behavior tests |
| `npm run build` | Build the Vinext/Cloudflare application |
| `npm run build:pages` | Build the static GitHub Pages version |
| `npm run test:pages` | Validate the generated Pages output |
| `npm run preview:pages` | Preview the static Pages build locally |

The static GitHub Pages output is generated in:

```text
out-pages/
```

## Deployment

Pushes to `main` trigger the GitHub Actions workflow at:

```text
.github/workflows/deploy-pages.yml
```

The workflow installs dependencies, runs lint and tests, builds the static frontend, validates the result, and deploys it through GitHub Pages.

Primary address:

**https://notanota.online/**

The custom domain is registered in the repository's GitHub Pages settings and is served by the automated Pages workflow.

## Project structure

```text
app/                  Main application and interface
github-pages/         Static Pages entry
public/               Public assets
tests/                Build and behavior tests
worker/               Optional Cloudflare Worker code
db/ and drizzle/      Optional database infrastructure
.github/workflows/    Automated GitHub Pages deployment
```

## Contributing

Bug reports, accessibility improvements, translations, and focused feature proposals are welcome.

For larger changes, open an issue first so the approach can be discussed before implementation.

1. Fork the repository.
2. Create a branch.
3. Make and test your changes.
4. Open a pull request with a clear explanation.

## Status

The core trainer is functional and includes all current practice ranges, both question styles, retry-until-correct sessions, responsive layouts, bilingual support, and end-of-session statistics.

---

<div align="center">

Built for small, repeatable practice sessions — **a little more fluent every day.**

</div>
