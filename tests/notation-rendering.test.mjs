import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/notation.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText.replace('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
const { MusicStaff } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('five-ledger-line extremes fit inside the actual rendered SVG', () => {
  for (const position of [-10, 0, 8, 18]) {
    const html = renderToStaticMarkup(createElement(MusicStaff, { position, label: 'A written note' }));
    const height = Number(html.match(/viewBox="0 0 480 (\d+)"/)[1]);
    for (const match of html.matchAll(/\b(?:y1|y2|cy)="(-?\d+)"/g)) {
      const y = Number(match[1]);
      assert.ok(y >= 7 && y <= height - 7, `${position}: geometry ${y} within ${height}`);
    }
    // Five staff lines plus precisely five ledger lines at either extreme.
    const horizontalLines = [...html.matchAll(/<line[^>]*x1="(?:80|238)"/g)].length;
    assert.equal(horizontalLines, position === -10 || position === 18 ? 10 : 5);
  }
});

test('bass clef and accidental render without revealing the answer in the accessible label', () => {
  const html = renderToStaticMarkup(createElement(MusicStaff, { position: 0, clef: 'bass', accidental: -1, label: 'A written note' }));
  assert.ok(html.includes('𝄢'));
  assert.ok(html.includes('♭'));
  assert.ok(html.includes('aria-label="A written note"'));
  assert.ok(!html.includes('G♭2'));
});
