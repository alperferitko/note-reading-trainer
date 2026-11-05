# Third-party notices

The NotaNota source code is under the [MIT License](./LICENSE). The components below are not; each keeps its own license or terms.

## Fonts

| Font | Files | License |
|---|---|---|
| Figtree | `app/fonts/figtree-*.woff2` | SIL Open Font License 1.1, © 2022 The Figtree Project Authors ([app/fonts/OFL.txt](./app/fonts/OFL.txt)) |
| TASA Orbiter | `app/fonts/tasa-orbiter-*.woff2` | SIL Open Font License 1.1, © 2022–2025 The TASA Typeface Collection Project Authors ([app/fonts/OFL.txt](./app/fonts/OFL.txt)) |
| Switzer | `app/fonts/switzer-*.woff2` | © 2015–2021 Indian Type Foundry, ITF Free Font License (Fontshare). Not open source and not covered by the MIT License. |
| Lora, Source Sans 3, Caveat | `public/fonts/*.woff2` | SIL Open Font License 1.1 (`public/fonts/OFL-*.txt`) |
| Noto Music, Liberation Serif | Glyph outlines in `app/scene/*.svg` (note shapes, the NotaNota wordmark letters) | SIL Open Font License 1.1 |

## Sound and scores

- **Piano samples** (`public/audio/piano/`): Salamander Grand Piano by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- **Ode to Joy** (`public/samples/ode-to-joy-mutopia-528*`): Beethoven, four-part setting, Mutopia Project #528, typeset by Peter Chubb, Public Domain.

## Images and marks

- **Lake scenes** (`app/scene/day.webp`, `app/scene/night.webp`): original images made for NotaNota with generative AI.
- **Footer scene** (`public/brand/footer-scene-*.webp`): a painted scene made for NotaNota.
- **Meta symbol** (`public/brand/meta-symbol.svg`): a trademark of Meta Platforms, Inc. It is used only to label the Meta colour theme and the Meta-powered features. It is not licensed under MIT.

## npm packages

The main runtime dependencies are listed below. Each package's license ships in `node_modules/<package>` after `npm ci`.

| Package | License |
|---|---|
| react, react-dom | MIT |
| next | MIT |
| @supabase/supabase-js | MIT |
| pitchy | MIT |
| opensheetmusicdisplay | BSD-3-Clause |
| pdfjs-dist | Apache-2.0 |
