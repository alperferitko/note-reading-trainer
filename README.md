<div align="center">

# ♪ Nota Nota

**Build fluent treble-clef note recognition through short, focused practice.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-notanota.online-EA5A42?style=for-the-badge)](https://notanota.online/)
[![React](https://img.shields.io/badge/React-19-182D28?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-182D28?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Languages](https://img.shields.io/badge/Languages-TR_%2F_EN-EA5A42?style=for-the-badge)](#language-support)

[Try Nota Nota](https://notanota.online/) · [Features](#features) · [How it works](#how-it-works)

</div>

![Nota Nota shown on desktop and mobile](./docs/nota-nota-preview.jpg)

## About

**Nota Nota** is a bilingual, mobile-friendly trainer for learning natural notes on the treble clef.

Each session presents every selected staff position once in a shuffled order. Incorrectly answered notes return later and remain in the session until they are identified correctly.

## Features

- Three progressive treble-clef practice ranges
- Visual staff and written-position question modes
- Turkish solfege and English letter names
- A newly shuffled question queue for every session
- Automatic repetition of incorrectly answered notes
- First-attempt accuracy and response-time statistics
- Responsive controls designed for desktop and mobile
- Fully browser-based with no account required

## How it works

1. Choose a practice range and question style.
2. Identify each shuffled note by typing its name.
3. Review your accuracy, response time, and most-missed notes.

Every note begins the session exactly once. A missed note moves to the end of the queue and returns until answered correctly.

## Practice ranges

| Level | Range | Notes |
|---|---|---:|
| **1** | Five staff lines and four spaces | 9 |
| **2** | Staff and nearby ledger lines | 13 |
| **3** | Every natural note from middle C to high C | 15 |

## Language support

| Interface | Note names |
|---|---|
| **Türkçe** | Do, Re, Mi, Fa, Sol, La, Si |
| **English** | C, D, E, F, G, A, B |

Your language preference is stored locally in the browser.

## Built with

React 19 · TypeScript · Vite · Vinext · GitHub Actions · GitHub Pages

The trainer runs entirely in the browser. Its queue-based session logic ensures that every selected position is practised and every missed note returns for review.

<details>
<summary><strong>Local development</strong></summary>

### Requirements

- Node.js 22.13 or newer
- npm

```bash
git clone https://github.com/alperferitko/note-reading-trainer.git
cd note-reading-trainer
npm ci
npm run dev
```

Useful commands:

```bash
npm run lint
npm test
npm run build:pages
npm run test:pages
```

</details>

## Contributing

Bug reports, accessibility improvements, translations, and focused feature proposals are welcome.

---

<div align="center">

**A little more fluent every day.**

[Open Nota Nota](https://notanota.online/)

</div>
