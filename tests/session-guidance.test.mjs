import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/session-guidance.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText
  .replace('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href))
  .replace("'@/lib/learning-path.mjs'", JSON.stringify(new URL('../lib/learning-path.mjs', import.meta.url).href))
  .replace("import './session-guidance.css';", '');
const { SessionGuidance } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const render = props => renderToStaticMarkup(createElement(SessionGuidance, { locale: 'en', wrong: 2, attempts: 8, ...props }));

test('no recommendation implies learning evidence from an empty session', () => {
  assert.equal(render({ module: 'score', wrong: 0, attempts: 0 }), '');
});

test('score feedback distinguishes note answer errors from unmeasured rhythm skill', () => {
  const html = render({ module: 'score' });
  assert.ok(html.includes('2 incorrect answers or timeouts'));
  assert.ok(html.includes('do not measure your actual rhythmic performance'));
  assert.ok(html.includes('<button type="button"'));
  assert.ok(!html.includes('role="dialog"'));
});

test('guitar modes and instrument limitations produce appropriate curated guidance', () => {
  assert.ok(render({ module: 'guitar', guitarMode: 'name-note' }).includes('Same name, different octave'));
  assert.ok(render({ module: 'guitar', guitarMode: 'staff-to-location' }).includes('selected fret range'));
  assert.ok(render({ module: 'piano' }).includes('do not assess hand position'));
  assert.ok(render({ module: 'violin' }).includes('not bow technique or actual intonation'));
  assert.ok(render({ module: 'piano', locale: 'tr' }).includes('Kısa dersi aç'));
});
