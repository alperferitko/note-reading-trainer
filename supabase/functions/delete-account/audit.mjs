const AUDIT_TABLE = "account_deletion_audit";

export const AUDIT_POLICY_VERSION = "2026-07";
export const SELF_SERVICE_METHOD = "self_service";

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLocaleLowerCase("en-US");
}

export async function createSubjectHash(email, secret) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !secret) throw new Error("account_deletion_failed");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(normalizedEmail),
  );

  return bytesToHex(new Uint8Array(signature));
}

export function deletionRetentionDate(requestedAt) {
  const date = new Date(requestedAt);
  if (Number.isNaN(date.getTime())) throw new Error("account_deletion_failed");

  const targetYear = date.getUTCFullYear() + 3;
  const month = date.getUTCMonth();
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);

  return [
    String(targetYear).padStart(4, "0"),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

async function createStartedAudit(adminClient, userEmail, auditSecret, requestedAt) {
  const subjectHash = await createSubjectHash(userEmail, auditSecret);
  const row = {
    subject_hash: subjectHash,
    deletion_method: SELF_SERVICE_METHOD,
    status: "started",
    requested_at: requestedAt.toISOString(),
    completed_at: null,
    retain_until: deletionRetentionDate(requestedAt),
    policy_version: AUDIT_POLICY_VERSION,
  };

  const { data, error } = await adminClient
    .from(AUDIT_TABLE)
    .insert(row)
    .select("id")
    .single();

  if (error || !data?.id) throw new Error("account_deletion_failed");
  return data.id;
}

async function setAuditStatus(adminClient, auditId, status, completedAt = null) {
  const { error } = await adminClient
    .from(AUDIT_TABLE)
    .update({
      status,
      completed_at: completedAt ? completedAt.toISOString() : null,
    })
    .eq("id", auditId);

  if (error) throw new Error("account_deletion_failed");
}

export async function deleteAccountWithAudit({
  adminClient,
  user,
  auditSecret,
  now = () => new Date(),
}) {
  if (!user?.id || !user?.email) throw new Error("account_deletion_failed");

  const requestedAt = now();
  const auditId = await createStartedAudit(
    adminClient,
    user.email,
    auditSecret,
    requestedAt,
  );

  const { error: deletionError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deletionError) {
    try {
      await setAuditStatus(adminClient, auditId, "failed");
    } catch {
      // The account remains active because Auth deletion did not succeed.
    }
    throw new Error("account_deletion_failed");
  }

  const completedAt = now();
  await setAuditStatus(adminClient, auditId, "completed", completedAt);

  return { deleted: true };
}
