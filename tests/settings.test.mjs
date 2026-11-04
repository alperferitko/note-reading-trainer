import assert from 'node:assert/strict';
import test from 'node:test';
import { localeRedirect, looksTurkish } from '../lib/locale-default.mjs';
import { namesLocale, pitchAt, pitchName, writeNoteNaming } from '../lib/music-pitch.mjs';

const visit = (extra) => ({ pathname: '/nota-oku/', root: '/', languages: ['de-DE'], timeZone: 'Europe/Berlin', ...extra });

test('a visitor outside Turkey opens the English page; Turkish browsers stay', () => {
  assert.equal(localeRedirect(visit({ search: '?x=1', hash: '#a' })), '/en/nota-oku/?x=1#a');
  assert.equal(localeRedirect(visit({ timeZone: 'Europe/Istanbul' })), null);
  assert.equal(localeRedirect(visit({ languages: ['tr-TR', 'en-US'] })), null);
  assert.equal(localeRedirect(visit({ pathname: '/note-reading-trainer/', root: '/note-reading-trainer/' })), '/note-reading-trainer/en/');
  assert.ok(looksTurkish({ languages: ['tr'] }));
});

test('an explicit choice, a lang parameter, the English site and crawlers are never redirected', () => {
  assert.equal(localeRedirect(visit({ choice: 'tr' })), null);
  assert.equal(localeRedirect(visit({ timeZone: 'Europe/Istanbul', choice: 'en' })), '/en/nota-oku/');
  assert.equal(localeRedirect(visit({ search: '?lang=tr' })), null);
  assert.equal(localeRedirect(visit({ pathname: '/en/nota-oku/' })), null);
  assert.equal(localeRedirect(visit({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })), null);
});

test('note names follow the language unless Settings picks a system', () => {
  const g4 = pitchAt(2, 'treble');
  writeNoteNaming('auto');
  assert.equal(pitchName(g4, 'tr'), 'Sol');
  assert.equal(pitchName(g4, 'en'), 'G');
  writeNoteNaming('letters');
  assert.equal(pitchName(g4, 'tr'), 'G');
  assert.equal(namesLocale('tr'), 'en');
  writeNoteNaming('solfege');
  assert.equal(pitchName(g4, 'en'), 'Sol');
  writeNoteNaming('auto');
});
