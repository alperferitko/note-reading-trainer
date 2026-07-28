create table if not exists public.account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null,
  deletion_method text not null,
  status text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  retain_until date not null,
  policy_version text not null,
  constraint account_deletion_audit_method_check
    check (deletion_method in ('self_service', 'email_request', 'admin')),
  constraint account_deletion_audit_status_check
    check (status in ('started', 'completed', 'failed')),
  constraint account_deletion_audit_completion_check
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed' and completed_at is null)
    )
);

comment on table public.account_deletion_audit is
  'Private, pseudonymized account deletion audit retained under the deletion policy.';

alter table public.account_deletion_audit enable row level security;

revoke all on table public.account_deletion_audit from public;
revoke all on table public.account_deletion_audit from anon;
revoke all on table public.account_deletion_audit from authenticated;

grant select, insert, update on table public.account_deletion_audit to service_role;
