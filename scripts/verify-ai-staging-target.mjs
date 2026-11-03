import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pins = JSON.parse(await readFile(new URL('../supabase/ai-staging-target.json', import.meta.url), 'utf8'));
for (const value of [pins.stagingProjectRef, pins.productionProjectRef]) assert.match(value ?? '', /^[a-z]{20}$/);
assert.notEqual(pins.stagingProjectRef, pins.productionProjectRef);
assert.equal(process.env.STAGING_REF, pins.stagingProjectRef);
assert.equal(process.env.CONFIRMED_REF, pins.stagingProjectRef);
assert.equal(process.env.PRODUCTION_REF, pins.productionProjectRef);
assert.match(process.env.CLI_VERSION ?? '', /^2\.\d+\.\d+$/);
assert.ok(pins.stagingOrigins.length && pins.productionOrigins.length);
for (const origin of pins.stagingOrigins) {
  assert.equal(new URL(origin).origin, origin);
  assert.equal(new URL(origin).protocol, 'https:');
  assert.ok(!pins.productionOrigins.includes(origin));
}
console.log('Reviewed target pins match staging environment; no secrets inspected.');