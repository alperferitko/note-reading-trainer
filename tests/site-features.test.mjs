import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SITE_PAGES, pageRoute, pageFromPath } from '../lib/site-routes.mjs';

test('all public pages have reversible bilingual clean routes', () => {
  for (const [key,page] of Object.entries(SITE_PAGES)) {
    for (const locale of ['tr','en']) {
      const route=pageRoute(key,locale);
      assert.equal(pageFromPath(new URL(route,'https://notanota.online/').pathname),key);
      assert.ok(page[locale][0] && page[locale][1]);
      assert.equal(route.includes('/en/'),locale==='en');
    }
  }
  assert.equal(pageFromPath('/%E0%A4%A'),'landing');
  assert.equal(pageRoute('quiz'),pageRoute('setup'));
});

test('site stays web-only and keeps its optimized logo',async()=>{
  const template=await readFile(new URL('../github-pages/index.html',import.meta.url),'utf8');
  const features=await readFile(new URL('../app/site-features.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(template,/rel="manifest"/);
  assert.doesNotMatch(features,/beforeinstallprompt|Install app|Uygulamayı yükle/);
  const logo=await readFile(new URL('../public/notanota-monogram-96.webp',import.meta.url));
  assert.ok(logo.length<12000);
  assert.equal(logo.toString('ascii',8,12),'WEBP');
});

test('weekly scores are independently stored and private; friend filtering occurs before the result limit',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/202609200001_weekly_and_friend_leaderboards.sql',import.meta.url),'utf8');
  assert.match(sql,/weekly_best_scores enable row level security/);
  assert.match(sql,/references auth\.users\(id\) on delete cascade/);
  assert.match(sql,/if v_result = 'ineligible' then return v_result/);
  assert.match(sql,/date_trunc\('week', now\(\) at time zone 'Europe\/Istanbul'\)/);
  assert.match(sql,/revoke all on function public\.submit_all_time_best_score[\s\S]*from public, anon, authenticated/);
  assert.match(sql,/p_usernames is null or lower\(p\.username\)=any[\s\S]*select \* from ranked order by rank limit/);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete).*weekly_best_scores/i);
});
