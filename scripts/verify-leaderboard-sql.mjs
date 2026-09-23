// Executes the weekly-leaderboard SQL behaviour checks.
//
//   npm run test:sql
//     Starts a disposable PostgreSQL container with Docker, applies every
//     migration on top of a minimal auth stand-in, runs the checks and removes
//     the container. Requires a running Docker engine; the first run pulls the
//     postgres image.
//
//   STAGING_DATABASE_URL=postgres://… npm run test:sql -- --staging
//     Runs only the checks against an existing Supabase staging database where
//     the migration has already been applied. Requires psql on PATH. The checks
//     run inside one transaction that is rolled back.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseDir = join(root, 'supabase');
const image = 'postgres:16';
const container = `notanota-sql-check-${process.pid}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

if (process.argv.includes('--staging')) {
  const url = process.env.STAGING_DATABASE_URL;
  if (!url) fail('Set STAGING_DATABASE_URL to the staging database connection string.', 2);
  if (!run('psql', ['--version']).ok) fail('psql was not found on PATH.', 2);
  const result = run('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', join(supabaseDir, 'tests', 'weekly_leaderboards.test.sql')], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const docker = run('docker', ['info', '--format', '{{.ServerVersion}}']);
if (!docker.ok) {
  fail([
    'The Docker engine is not running, so no disposable database could be started.',
    'Start Docker Desktop and run `npm run test:sql` again, or use --staging with STAGING_DATABASE_URL.',
    'Nothing was started and no image was pulled.',
  ].join('\n'), 2);
}

const started = run('docker', ['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=local-check-only',
  '-v', `${supabaseDir}:/work:ro`, image]);
if (!started.ok) fail(`Could not start ${image}:\n${started.stderr}`);

try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    ready = run('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']).ok;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) fail('PostgreSQL did not become ready within 30 seconds.');
  const result = run('docker', ['exec', container, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1', '-f', '/work/tests/run-local.sql'], { stdio: 'inherit' });
  if (!result.ok) fail('Weekly leaderboard SQL checks failed.');
} finally {
  run('docker', ['stop', container]);
}
