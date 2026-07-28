import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUDIT_POLICY_VERSION,
  createSubjectHash,
  deleteAccountWithAudit,
  deletionRetentionDate,
} from "../supabase/functions/delete-account/audit.mjs";

const testKey = "unit-test-key-material-with-no-production-value";
const rawEmail = "  Person.Example@Example.COM ";
const normalizedEmail = "person.example@example.com";

function createAdminMock({ deletionError = null } = {}) {
  const state = {
    insertedRows: [],
    updates: [],
    deleteCalls: [],
  };

  const adminClient = {
    from(table) {
      assert.equal(table, "account_deletion_audit");
      return {
        insert(row) {
          state.insertedRows.push(structuredClone(row));
          return {
            select(columns) {
              assert.equal(columns, "id");
              return {
                async single() {
                  return { data: { id: "audit-row-id" }, error: null };
                },
              };
            },
          };
        },
        update(values) {
          return {
            async eq(column, value) {
              state.updates.push({
                values: structuredClone(values),
                column,
                value,
              });
              return { error: null };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async deleteUser(userId) {
          state.deleteCalls.push(userId);
          return { data: null, error: deletionError };
        },
      },
    },
  };

  return { adminClient, state };
}

test("audit identity uses normalized-email HMAC-SHA256, never a plain digest", async () => {
  const subjectHash = await createSubjectHash(rawEmail, testKey);
  const expectedHmac = createHmac("sha256", testKey)
    .update(normalizedEmail)
    .digest("hex");
  const forbiddenPlainHash = createHash("sha256")
    .update(normalizedEmail)
    .digest("hex");

  assert.equal(subjectHash, expectedHmac);
  assert.notEqual(subjectHash, forbiddenPlainHash);
  assert.equal(subjectHash.length, 64);
});

test("successful deletion records started then completed without raw identity data", async () => {
  const { adminClient, state } = createAdminMock();
  const moments = [
    new Date("2026-07-28T10:00:00.000Z"),
    new Date("2026-07-28T10:00:01.250Z"),
  ];

  const result = await deleteAccountWithAudit({
    adminClient,
    user: { id: "user-id", email: rawEmail, user_metadata: { username: "Nota7" } },
    auditSecret: testKey,
    now: () => moments.shift(),
  });

  assert.deepEqual(result, { deleted: true });
  assert.deepEqual(state.deleteCalls, ["user-id"]);
  assert.equal(state.insertedRows.length, 1);
  assert.equal(state.insertedRows[0].status, "started");
  assert.equal(state.insertedRows[0].deletion_method, "self_service");
  assert.equal(state.insertedRows[0].policy_version, AUDIT_POLICY_VERSION);
  assert.equal(state.insertedRows[0].retain_until, "2029-07-28");
  assert.equal(state.updates.length, 1);
  assert.deepEqual(state.updates[0], {
    values: {
      status: "completed",
      completed_at: "2026-07-28T10:00:01.250Z",
    },
    column: "id",
    value: "audit-row-id",
  });

  const storedAudit = JSON.stringify(state.insertedRows);
  assert.doesNotMatch(storedAudit, /person\.example@example\.com/i);
  assert.doesNotMatch(storedAudit, /Nota7/);
  assert.doesNotMatch(storedAudit, /user-id/);
  assert.doesNotMatch(storedAudit, /access[_-]?token|jwt|magic[_-]?link/i);
});

test("failed Auth deletion records failed and reports only a safe error", async () => {
  const { adminClient, state } = createAdminMock({
    deletionError: { message: "internal provider detail" },
  });

  await assert.rejects(
    deleteAccountWithAudit({
      adminClient,
      user: { id: "still-active-user", email: rawEmail },
      auditSecret: testKey,
      now: () => new Date("2026-07-28T10:00:00.000Z"),
    }),
    (error) => error instanceof Error
      && error.message === "account_deletion_failed"
      && !error.message.includes("provider"),
  );

  assert.deepEqual(state.deleteCalls, ["still-active-user"]);
  assert.equal(state.insertedRows[0].status, "started");
  assert.deepEqual(state.updates, [{
    values: { status: "failed", completed_at: null },
    column: "id",
    value: "audit-row-id",
  }]);
});

test("migration and Edge Function keep the audit table private and server-owned", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607280001_add_account_deletion_audit.sql", import.meta.url),
    "utf8",
  );
  const edgeFunction = await readFile(
    new URL("../supabase/functions/delete-account/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /alter table public\.account_deletion_audit enable row level security;/i);
  assert.match(migration, /revoke all on table public\.account_deletion_audit from public;/i);
  assert.match(migration, /revoke all on table public\.account_deletion_audit from anon;/i);
  assert.match(migration, /revoke all on table public\.account_deletion_audit from authenticated;/i);
  assert.match(migration, /grant select, insert, update on table public\.account_deletion_audit to service_role;/i);
  assert.doesNotMatch(migration, /\bcreate policy\b/i);
  assert.doesNotMatch(migration, /\b(email|username|ip_address|access_token|jwt|request_body|magic_link_token)\b/i);

  assert.match(edgeFunction, /requiredEnvironment\("DELETION_AUDIT_HMAC_KEY"\)/);
  assert.match(edgeFunction, /request\.method !== "POST"/);
  assert.match(edgeFunction, /createClient\(supabaseUrl, serverAdminKey/);
  assert.match(edgeFunction, /deleteAccountWithAudit\(\{[\s\S]*adminClient/);
  assert.doesNotMatch(edgeFunction, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(edgeFunction, /return jsonResponse\(\{ error: (?:error|userError|deletionError)/);
});

test("retention date remains at least three calendar years, including leap day", () => {
  assert.equal(deletionRetentionDate(new Date("2026-07-28T23:59:59Z")), "2029-07-28");
  assert.equal(deletionRetentionDate(new Date("2028-02-29T12:00:00Z")), "2031-02-28");
});
