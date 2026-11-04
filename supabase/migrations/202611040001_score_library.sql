-- Score library ("Eserlerim" + "Ortak kütüphane"). Authored for STAGING only: the owner applies it
-- by hand in the Supabase SQL Editor of the staging project. Never apply to production without a
-- separate, explicit decision.
--
-- Every write goes through the security definer RPCs below; clients have SELECT (under RLS) and
-- nothing else. Raw uploads (score_sources, bucket score-sources) stay readable only by their owner
-- and app admins, also after publication. The public library is the view public.library_scores and
-- the RPC public.library_score_open(); neither exposes owners, hashes or storage paths.
--
-- Status lifecycle of public.scores.status (enforced by the RPCs and, as a backstop, by the
-- scores_guard trigger, so not even a definer function can skip a step):
--
--   from              to                 by
--   (new upload)      processing         score_create without MusicXML (OMR job follows the upload)
--   (new import)      needs_correction   score_create with MusicXML (direct import, no OMR)
--   processing        needs_correction   score_job_finish(ok)            worker / service_role
--   needs_correction  needs_correction   score_save_correction(confirm=false)   owner, draft
--   needs_correction  ready_personal     score_save_correction(confirm=true)    owner
--   ready_personal    needs_correction   score_save_correction(confirm=false)   owner reopens
--   ready_personal    ready_personal     score_save_correction(confirm=true)    owner
--   ready_personal    pending_review     score_submit_for_review         owner, license + statement
--   pending_review    published          score_review(approve)           app admin, all checks true
--   pending_review    rejected           score_review(reject, reason)    app admin
--   rejected          needs_correction   score_save_correction(confirm=false)   owner revises
--   rejected          ready_personal     score_save_correction(confirm=true)    owner revises
--   published         published          score_publish_fix               app admin, new version
--
-- OMR failure rule: a failed job never changes the score status. A failure with attempts left puts
-- the same job row back to 'queued'; the last failure marks the job 'failed' and the score stays
-- 'processing' until the owner asks for recognition again (score_request_recognition) or deletes it.
-- The owner's own confirmation ('ready_personal') is personal use only, never publication.
begin;

-- Admins ---------------------------------------------------------------------------------------
create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from public, anon, authenticated, service_role;

create function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.app_admins a where a.user_id = auth.uid())
$$;
revoke all on function public.is_app_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_app_admin() to authenticated;

-- Tables ---------------------------------------------------------------------------------------
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  composer text check (composer is null or char_length(composer) between 1 and 200),
  instrument text check (instrument is null or char_length(instrument) between 1 and 60),
  difficulty text check (difficulty is null or difficulty in ('beginner', 'intermediate', 'advanced')),
  source_note text check (source_note is null or char_length(source_note) between 1 and 500),
  license text not null default 'unknown'
    check (license in ('public_domain', 'cc_by', 'cc_by_sa', 'own_work', 'permission', 'unknown')),
  share_statement text check (share_statement is null or char_length(share_statement) between 1 and 2000),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing'
    check (status in ('processing', 'needs_correction', 'ready_personal', 'pending_review', 'published', 'rejected')),
  current_version_id uuid,
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_hash)
);
create index scores_owner_updated on public.scores(owner_id, updated_at desc);
create index scores_status on public.scores(status) where status in ('pending_review', 'published');

create table public.score_sources (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null unique references public.scores(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/png', 'image/jpeg',
    'application/vnd.recordare.musicxml+xml', 'application/vnd.recordare.musicxml')),
  bytes bigint not null check (bytes between 1 and 20971520),
  page_count integer check (page_count is null or page_count between 1 and 200),
  selected_pages integer[] check (selected_pages is null or (cardinality(selected_pages) between 1 and 200
    and 1 <= all(selected_pages) and 200 >= all(selected_pages))),
  created_at timestamptz not null default now(),
  -- Path is always {owner_id}/{sha256}.{ext}; the hash part must be the score's source_hash (RPC).
  check (storage_path ~ ('^' || owner_id::text || '/[a-f0-9]{64}\.(pdf|png|jpg|musicxml|mxl)$'))
);

create table public.score_versions (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  kind text not null check (kind in ('recognized', 'corrected', 'published')),
  base_version_id uuid references public.score_versions(id) on delete cascade,
  musicxml text not null check (octet_length(musicxml) between 1 and 5242880),
  corrections jsonb check (corrections is null or (jsonb_typeof(corrections) = 'array' and octet_length(corrections::text) <= 262144)),
  engine text check (engine is null or char_length(engine) between 1 and 60),
  engine_version text check (engine_version is null or char_length(engine_version) between 1 and 60),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array' and octet_length(warnings::text) <= 131072),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'recognized') = (base_version_id is null)),
  check (kind = 'corrected' or corrections is null)
);
create index score_versions_score on public.score_versions(score_id, created_at desc);
alter table public.scores add constraint scores_current_version_fk
  foreign key (current_version_id) references public.score_versions(id) on delete set null;

create table public.score_jobs (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'queued' check (state in ('queued', 'running', 'succeeded', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,60}$'),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attempts <= max_attempts)
);
-- At most one queued/running job per score: a retry reuses it, never duplicates it.
create unique index score_jobs_one_active on public.score_jobs(score_id) where state in ('queued', 'running');
create index score_jobs_queue on public.score_jobs(created_at) where state in ('queued', 'running');

create table public.score_reviews (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('approve', 'reject')),
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  checks jsonb not null check (jsonb_typeof(checks) = 'object'
    and jsonb_typeof(checks->'accuracy') = 'boolean' and jsonb_typeof(checks->'content') = 'boolean'
    and jsonb_typeof(checks->'rights') = 'boolean'),
  reviewed_version_id uuid not null references public.score_versions(id) on delete cascade,
  published_version_id uuid references public.score_versions(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (decision = 'approve' or reason is not null)
);
create index score_reviews_score on public.score_reviews(score_id, created_at desc);

create table public.score_reports (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.score_versions(id) on delete cascade,
  measure integer not null check (measure between 1 and 10000),
  message text not null check (char_length(message) between 1 and 1000),
  state text not null default 'open' check (state in ('open', 'fixed', 'dismissed')),
  fixed_version_id uuid references public.score_versions(id) on delete cascade,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state = 'fixed') = (fixed_version_id is not null))
);
create index score_reports_score on public.score_reports(score_id, state);
create index score_reports_reporter on public.score_reports(reporter_id, created_at);

-- Guards ---------------------------------------------------------------------------------------
create function public.scores_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.source_hash <> old.source_hash
    or new.created_at <> old.created_at then
    raise exception 'score_identity_immutable';
  end if;
  if new.status <> old.status and (old.status, new.status) not in (
    ('processing', 'needs_correction'),
    ('needs_correction', 'ready_personal'),
    ('ready_personal', 'needs_correction'),
    ('ready_personal', 'pending_review'),
    ('pending_review', 'published'),
    ('pending_review', 'rejected'),
    ('rejected', 'needs_correction'),
    ('rejected', 'ready_personal')) then
    raise exception 'invalid_transition';
  end if;
  if new.current_version_id is distinct from old.current_version_id and new.current_version_id is not null
    and not exists (select 1 from public.score_versions v where v.id = new.current_version_id and v.score_id = new.id) then
    raise exception 'version_mismatch';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger scores_guard before update on public.scores for each row execute function public.scores_guard();

create function public.score_versions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- The only change ever allowed: created_by -> null when that account is deleted.
    if old.created_by is not null and new.created_by is null
      and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then return new; end if;
    raise exception 'score_versions_immutable';
  end if;
  if tg_op = 'DELETE' then
    -- Only the cascade from a deleted score may remove versions.
    if exists (select 1 from public.scores s where s.id = old.score_id) then raise exception 'score_versions_immutable'; end if;
    return old;
  end if;
  if new.base_version_id is not null and not exists (
    select 1 from public.score_versions b where b.id = new.base_version_id and b.score_id = new.score_id) then
    raise exception 'version_mismatch';
  end if;
  return new;
end $$;
create trigger score_versions_guard before insert or update or delete on public.score_versions
  for each row execute function public.score_versions_guard();

revoke all on function public.scores_guard() from public, anon, authenticated, service_role;
revoke all on function public.score_versions_guard() from public, anon, authenticated, service_role;

-- RLS: SELECT only, writes only through RPCs ---------------------------------------------------
alter table public.scores enable row level security;
alter table public.score_sources enable row level security;
alter table public.score_versions enable row level security;
alter table public.score_jobs enable row level security;
alter table public.score_reviews enable row level security;
alter table public.score_reports enable row level security;

revoke all on table public.scores, public.score_sources, public.score_versions, public.score_jobs,
  public.score_reviews, public.score_reports from public, anon, authenticated, service_role;
grant select on table public.scores, public.score_sources, public.score_versions, public.score_jobs,
  public.score_reviews, public.score_reports to authenticated;

create policy "Owners and admins read scores" on public.scores for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_app_admin()));
create policy "Owners and admins read sources" on public.score_sources for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_app_admin()));
create policy "Owners and admins read versions" on public.score_versions for select to authenticated
  using ((select public.is_app_admin())
    or exists (select 1 from public.scores s where s.id = score_id and s.owner_id = (select auth.uid())));
create policy "Owners and admins read jobs" on public.score_jobs for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_app_admin()));
create policy "Owners and admins read reviews" on public.score_reviews for select to authenticated
  using ((select public.is_app_admin())
    or exists (select 1 from public.scores s where s.id = score_id and s.owner_id = (select auth.uid())));
create policy "Reporters and admins read reports" on public.score_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_app_admin()));

-- Helpers --------------------------------------------------------------------------------------
create function public.score_valid_musicxml(p_musicxml text) returns boolean
language sql immutable set search_path = '' as $$
  select p_musicxml is not null and octet_length(p_musicxml) between 1 and 5242880
    and p_musicxml ~ '<score-(partwise|timewise)[\s>]'
$$;
create function public.score_valid_list(p_value jsonb, p_max integer) returns boolean
language sql immutable set search_path = '' as $$
  select p_value is not null and jsonb_typeof(p_value) = 'array' and octet_length(p_value::text) <= p_max
$$;
revoke all on function public.score_valid_musicxml(text) from public, anon, authenticated, service_role;
revoke all on function public.score_valid_list(jsonb, integer) from public, anon, authenticated, service_role;

-- Owner RPCs -----------------------------------------------------------------------------------
-- Duplicate upload (same owner, same hash) returns the existing score, never a copy.
create function public.score_create(p_title text, p_composer text, p_instrument text, p_difficulty text,
  p_source_note text, p_license text, p_source_hash text, p_musicxml text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := lower(nullif(trim(p_source_hash), ''));
  v_title text := nullif(trim(p_title), '');
  v_composer text := nullif(trim(p_composer), '');
  v_instrument text := nullif(trim(p_instrument), '');
  v_note text := nullif(trim(p_source_note), '');
  v_score public.scores%rowtype;
  v_version uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_musicxml is not null and not public.score_valid_musicxml(p_musicxml) then raise exception 'invalid_musicxml'; end if;
  if v_hash is null and p_musicxml is not null then
    v_hash := encode(sha256(convert_to(p_musicxml, 'UTF8')), 'hex');
  end if;
  if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_hash'; end if;
  select * into v_score from public.scores where owner_id = v_uid and source_hash = v_hash;
  if found then
    return jsonb_build_object('scoreId', v_score.id, 'duplicate', true, 'status', v_score.status);
  end if;
  if v_title is null or char_length(v_title) > 200 or char_length(v_composer) > 200
    or char_length(v_instrument) > 60 or char_length(v_note) > 500
    or coalesce(p_difficulty, 'beginner') not in ('beginner', 'intermediate', 'advanced')
    or coalesce(p_license, 'unknown') not in ('public_domain', 'cc_by', 'cc_by_sa', 'own_work', 'permission', 'unknown') then
    raise exception 'invalid_input';
  end if;
  if (select count(*) from public.scores where owner_id = v_uid and created_at > now() - interval '1 day') >= 30
    or (select count(*) from public.scores where owner_id = v_uid) >= 500 then
    raise exception 'rate_limited';
  end if;
  insert into public.scores(owner_id, title, composer, instrument, difficulty, source_note, license, source_hash, status)
    values (v_uid, v_title, v_composer, v_instrument, p_difficulty, v_note, coalesce(p_license, 'unknown'),
      v_hash, 'processing')
    on conflict (owner_id, source_hash) do nothing
    returning * into v_score;
  if v_score.id is null then
    -- A concurrent identical create won the race.
    select * into strict v_score from public.scores where owner_id = v_uid and source_hash = v_hash;
    return jsonb_build_object('scoreId', v_score.id, 'duplicate', true, 'status', v_score.status);
  end if;
  if p_musicxml is not null then
    insert into public.score_versions(score_id, kind, musicxml, engine, created_by)
      values (v_score.id, 'recognized', p_musicxml, 'musicxml_import', v_uid) returning id into v_version;
    update public.scores set status = 'needs_correction', current_version_id = v_version where id = v_score.id;
    v_score.status := 'needs_correction';
  end if;
  return jsonb_build_object('scoreId', v_score.id, 'duplicate', false, 'status', v_score.status);
end $$;

-- Records the uploaded raw file (already in storage at {owner}/{hash}.{ext}) and, for PDF/images of
-- a score still 'processing', queues the OMR job (or returns the active one).
create function public.score_attach_source(p_score_id uuid, p_mime text, p_bytes bigint,
  p_page_count integer, p_selected_pages integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_ext text;
  v_path text;
  v_job uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_score from public.scores where id = p_score_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  v_ext := case p_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/jpeg' then 'jpg'
    when 'application/vnd.recordare.musicxml+xml' then 'musicxml' when 'application/vnd.recordare.musicxml' then 'mxl' end;
  if v_ext is null then raise exception 'unsupported_type'; end if;
  if p_bytes is null or p_bytes < 1 then raise exception 'invalid_input'; end if;
  if p_bytes > 20971520 then raise exception 'file_too_large'; end if;
  if p_page_count is not null and p_page_count not between 1 and 200
    or (p_selected_pages is not null and (cardinality(p_selected_pages) not between 1 and 200
      or array_position(p_selected_pages, null) is not null
      or not (1 <= all(p_selected_pages)) or not (coalesce(p_page_count, 200) >= all(p_selected_pages)))) then
    raise exception 'invalid_input';
  end if;
  v_path := v_uid::text || '/' || v_score.source_hash || '.' || v_ext;
  if exists (select 1 from public.score_sources where score_id = p_score_id) then
    raise exception 'source_exists';
  end if;
  insert into public.score_sources(score_id, owner_id, storage_path, mime, bytes, page_count, selected_pages)
    values (p_score_id, v_uid, v_path, p_mime, p_bytes, p_page_count, p_selected_pages);
  if v_score.status = 'processing' and v_ext in ('pdf', 'png', 'jpg') then
    insert into public.score_jobs(score_id, owner_id) values (p_score_id, v_uid)
      on conflict (score_id) where state in ('queued', 'running') do nothing returning id into v_job;
    if v_job is null then
      select id into v_job from public.score_jobs where score_id = p_score_id and state in ('queued', 'running');
    end if;
  end if;
  return jsonb_build_object('storagePath', v_path, 'jobId', v_job);
end $$;

-- Retry after a failed recognition. Returns the active job if one exists; never a second one.
create function public.score_request_recognition(p_score_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_job uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_score from public.scores where id = p_score_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if v_score.status <> 'processing' then raise exception 'invalid_transition'; end if;
  if not exists (select 1 from public.score_sources where score_id = p_score_id
    and mime in ('application/pdf', 'image/png', 'image/jpeg')) then raise exception 'source_missing'; end if;
  select id into v_job from public.score_jobs where score_id = p_score_id and state in ('queued', 'running');
  if found then return jsonb_build_object('jobId', v_job, 'created', false); end if;
  if (select count(*) from public.score_jobs where score_id = p_score_id) >= 5 then raise exception 'rate_limited'; end if;
  insert into public.score_jobs(score_id, owner_id) values (p_score_id, v_uid)
    on conflict (score_id) where state in ('queued', 'running') do nothing returning id into v_job;
  if v_job is null then
    select id into strict v_job from public.score_jobs where score_id = p_score_id and state in ('queued', 'running');
    return jsonb_build_object('jobId', v_job, 'created', false);
  end if;
  return jsonb_build_object('jobId', v_job, 'created', true);
end $$;

create function public.score_save_correction(p_score_id uuid, p_musicxml text, p_corrections jsonb,
  p_warnings jsonb, p_confirm boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_version uuid;
  v_status text := case when p_confirm then 'ready_personal' else 'needs_correction' end;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_score from public.scores where id = p_score_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if v_score.status not in ('needs_correction', 'ready_personal', 'rejected') or v_score.current_version_id is null then
    raise exception 'invalid_transition';
  end if;
  if not public.score_valid_musicxml(p_musicxml) then raise exception 'invalid_musicxml'; end if;
  if not public.score_valid_list(coalesce(p_corrections, '[]'), 262144)
    or not public.score_valid_list(coalesce(p_warnings, '[]'), 131072) then raise exception 'invalid_input'; end if;
  insert into public.score_versions(score_id, kind, base_version_id, musicxml, corrections, warnings, created_by)
    values (p_score_id, 'corrected', v_score.current_version_id, p_musicxml, coalesce(p_corrections, '[]'),
      coalesce(p_warnings, '[]'), v_uid)
    returning id into v_version;
  update public.scores set current_version_id = v_version, status = v_status where id = p_score_id;
  return jsonb_build_object('versionId', v_version, 'status', v_status);
end $$;

create function public.score_submit_for_review(p_score_id uuid, p_license text, p_share_statement text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_statement text := nullif(trim(p_share_statement), '');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_score from public.scores where id = p_score_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if v_score.status <> 'ready_personal' then raise exception 'invalid_transition'; end if;
  if p_license is null or p_license = 'unknown'
    or p_license not in ('public_domain', 'cc_by', 'cc_by_sa', 'own_work', 'permission') then
    raise exception 'license_required';
  end if;
  if v_statement is null or char_length(v_statement) < 10 then raise exception 'share_statement_required'; end if;
  if char_length(v_statement) > 2000 then raise exception 'invalid_input'; end if;
  update public.scores set license = p_license, share_statement = v_statement, status = 'pending_review',
    submitted_at = now() where id = p_score_id;
  return jsonb_build_object('status', 'pending_review');
end $$;

-- Owner deletes a score that is not in the library (or under review). Rows cascade; the client
-- removes the returned storage object (storage policies allow only the owner's folder).
create function public.score_delete(p_score_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_path text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_score from public.scores where id = p_score_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if v_score.status in ('pending_review', 'published') then raise exception 'invalid_transition'; end if;
  select storage_path into v_path from public.score_sources where score_id = p_score_id;
  delete from public.scores where id = p_score_id;
  return jsonb_build_object('deleted', true, 'storagePath', v_path);
end $$;

-- Any signed-in user, published scores only.
create function public.score_report_error(p_score_id uuid, p_measure integer, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version uuid;
  v_report uuid;
  v_message text := nullif(trim(p_message), '');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select v.id into v_version from public.scores s
    join public.score_versions v on v.score_id = s.id and v.kind = 'published'
    where s.id = p_score_id and s.status = 'published' order by v.created_at desc, v.id limit 1;
  if v_version is null then raise exception 'not_found'; end if;
  if p_measure is null or p_measure not between 1 and 10000 or v_message is null or char_length(v_message) > 1000 then
    raise exception 'invalid_input';
  end if;
  if (select count(*) from public.score_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.score_reports(score_id, reporter_id, version_id, measure, message)
    values (p_score_id, v_uid, v_version, p_measure, v_message) returning id into v_report;
  return jsonb_build_object('reportId', v_report);
end $$;

-- Admin RPCs -----------------------------------------------------------------------------------
create function public.score_review(p_score_id uuid, p_decision text, p_reason text, p_checks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_base public.score_versions%rowtype;
  v_published uuid;
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not public.is_app_admin() then raise exception 'admin_required'; end if;
  select * into v_score from public.scores where id = p_score_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_score.status <> 'pending_review' then raise exception 'invalid_transition'; end if;
  if not coalesce(p_decision in ('approve', 'reject') and jsonb_typeof(p_checks) = 'object'
    and jsonb_typeof(p_checks->'accuracy') = 'boolean' and jsonb_typeof(p_checks->'content') = 'boolean'
    and jsonb_typeof(p_checks->'rights') = 'boolean', false) or char_length(v_reason) > 1000 then
    raise exception 'invalid_input';
  end if;
  select * into strict v_base from public.score_versions where id = v_score.current_version_id;
  if p_decision = 'approve' then
    if not ((p_checks->>'accuracy')::boolean and (p_checks->>'content')::boolean and (p_checks->>'rights')::boolean) then
      raise exception 'checks_incomplete';
    end if;
    insert into public.score_versions(score_id, kind, base_version_id, musicxml, engine, engine_version, warnings, created_by)
      values (p_score_id, 'published', v_base.id, v_base.musicxml, v_base.engine, v_base.engine_version, v_base.warnings, v_uid)
      returning id into v_published;
    update public.scores set status = 'published', current_version_id = v_published, published_at = now()
      where id = p_score_id;
  else
    if v_reason is null then raise exception 'reason_required'; end if;
    update public.scores set status = 'rejected' where id = p_score_id;
  end if;
  insert into public.score_reviews(score_id, reviewer_id, decision, reason, checks, reviewed_version_id, published_version_id)
    values (p_score_id, v_uid, p_decision, v_reason,
      jsonb_build_object('accuracy', p_checks->'accuracy', 'content', p_checks->'content', 'rights', p_checks->'rights'),
      v_base.id, v_published);
  return jsonb_build_object('status', case when p_decision = 'approve' then 'published' else 'rejected' end,
    'publishedVersionId', v_published);
end $$;

-- Admin publishes a corrected library version and closes the reports it fixes.
create function public.score_publish_fix(p_score_id uuid, p_musicxml text, p_report_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_score public.scores%rowtype;
  v_base uuid;
  v_version uuid;
  v_fixed integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not public.is_app_admin() then raise exception 'admin_required'; end if;
  select * into v_score from public.scores where id = p_score_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_score.status <> 'published' then raise exception 'invalid_transition'; end if;
  if not public.score_valid_musicxml(p_musicxml) then raise exception 'invalid_musicxml'; end if;
  p_report_ids := coalesce(p_report_ids, '{}');
  if (select count(*) from public.score_reports where id = any(p_report_ids) and score_id = p_score_id and state = 'open')
    <> (select count(distinct x) from unnest(p_report_ids) x) then
    raise exception 'invalid_report';
  end if;
  select id into strict v_base from public.score_versions where score_id = p_score_id and kind = 'published'
    order by created_at desc, id limit 1;
  insert into public.score_versions(score_id, kind, base_version_id, musicxml, engine, created_by)
    values (p_score_id, 'published', v_base, p_musicxml, 'admin_fix', v_uid) returning id into v_version;
  update public.scores set current_version_id = v_version where id = p_score_id;
  update public.score_reports set state = 'fixed', fixed_version_id = v_version, resolved_by = v_uid, resolved_at = now()
    where id = any(p_report_ids);
  get diagnostics v_fixed = row_count;
  return jsonb_build_object('publishedVersionId', v_version, 'fixedReports', v_fixed);
end $$;

create function public.score_report_dismiss(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not public.is_app_admin() then raise exception 'admin_required'; end if;
  update public.score_reports set state = 'dismissed', resolved_by = v_uid, resolved_at = now()
    where id = p_report_id and state = 'open';
  if not found then raise exception 'invalid_report'; end if;
  return jsonb_build_object('state', 'dismissed');
end $$;

-- Worker RPCs (service_role only) --------------------------------------------------------------
-- Claims the oldest queued job, or a running one whose lease expired. Each claim is one attempt.
create function public.score_job_claim(p_lease_seconds integer default 600)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz := clock_timestamp();
  j public.score_jobs%rowtype;
  s public.score_sources%rowtype;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then raise exception 'invalid_input'; end if;
  update public.score_jobs set state = 'failed', error_code = coalesce(error_code, 'lease_expired'),
    lease_token = null, lease_expires_at = null, updated_at = t
    where state = 'running' and lease_expires_at <= t and attempts >= max_attempts;
  select * into j from public.score_jobs
    where state = 'queued' or (state = 'running' and lease_expires_at <= t)
    order by created_at, id limit 1 for update skip locked;
  if not found then return jsonb_build_object('status', 'empty'); end if;
  update public.score_jobs set state = 'running', attempts = attempts + 1, lease_token = gen_random_uuid(),
    lease_expires_at = t + make_interval(secs => p_lease_seconds), progress = 0, updated_at = t
    where id = j.id returning * into j;
  select * into s from public.score_sources where score_id = j.score_id;
  return jsonb_build_object('status', 'claimed', 'jobId', j.id, 'leaseToken', j.lease_token,
    'scoreId', j.score_id, 'attempt', j.attempts, 'storagePath', s.storage_path, 'mime', s.mime,
    'selectedPages', to_jsonb(s.selected_pages));
end $$;

create function public.score_job_progress(p_job_id uuid, p_lease_token uuid, p_progress integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.score_jobs%rowtype;
begin
  select * into j from public.score_jobs where id = p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state <> 'running' or j.lease_token is distinct from p_lease_token then raise exception 'lease_lost'; end if;
  if p_progress is null or p_progress not between 0 and 99 then raise exception 'invalid_input'; end if;
  update public.score_jobs set progress = greatest(progress, p_progress), updated_at = clock_timestamp(),
    lease_expires_at = greatest(lease_expires_at, clock_timestamp() + interval '2 minutes') where id = p_job_id;
  return jsonb_build_object('status', 'running');
end $$;

-- ok: inserts the 'recognized' version, job succeeded, score processing -> needs_correction.
-- not ok: attempts left -> same job back to 'queued'; none left -> job 'failed'; score unchanged.
create function public.score_job_finish(p_job_id uuid, p_lease_token uuid, p_ok boolean, p_musicxml text,
  p_engine text, p_engine_version text, p_warnings jsonb, p_error_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz := clock_timestamp();
  j public.score_jobs%rowtype;
  v_score public.scores%rowtype;
  v_version uuid;
  v_state text;
begin
  select * into j from public.score_jobs where id = p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state <> 'running' or j.lease_token is distinct from p_lease_token then raise exception 'lease_lost'; end if;
  select * into strict v_score from public.scores where id = j.score_id for update;
  if p_ok then
    if v_score.status <> 'processing' then raise exception 'invalid_transition'; end if;
    if not public.score_valid_musicxml(p_musicxml) then raise exception 'invalid_musicxml'; end if;
    if p_engine is null or char_length(p_engine) not between 1 and 60 or char_length(p_engine_version) not between 1 and 60
      or not public.score_valid_list(coalesce(p_warnings, '[]'), 131072) then raise exception 'invalid_input'; end if;
    insert into public.score_versions(score_id, kind, musicxml, engine, engine_version, warnings)
      values (j.score_id, 'recognized', p_musicxml, p_engine, p_engine_version, coalesce(p_warnings, '[]'))
      returning id into v_version;
    update public.scores set status = 'needs_correction', current_version_id = v_version where id = j.score_id;
    update public.score_jobs set state = 'succeeded', progress = 100, error_code = null, lease_token = null,
      lease_expires_at = null, updated_at = t where id = p_job_id;
    return jsonb_build_object('state', 'succeeded', 'versionId', v_version);
  end if;
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,60}$' then raise exception 'invalid_input'; end if;
  v_state := case when j.attempts < j.max_attempts then 'queued' else 'failed' end;
  update public.score_jobs set state = v_state, error_code = p_error_code, lease_token = null,
    lease_expires_at = null, updated_at = t where id = p_job_id;
  return jsonb_build_object('state', v_state);
end $$;

-- Public library -------------------------------------------------------------------------------
create function public.library_score_rows()
returns table (score_id uuid, title text, composer text, instrument text, difficulty text, license text,
  source_note text, published_version_id uuid, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.composer, s.instrument, s.difficulty, s.license, s.source_note, v.id, s.published_at
  from public.scores s
  join lateral (select pv.id from public.score_versions pv where pv.score_id = s.id and pv.kind = 'published'
    order by pv.created_at desc, pv.id limit 1) v on true
  where s.status = 'published'
$$;
-- security_invoker: the view itself grants nothing; the definer function returns safe columns only.
create view public.library_scores with (security_invoker = true) as select * from public.library_score_rows();

create function public.library_score_open(p_score_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('scoreId', r.score_id, 'title', r.title, 'composer', r.composer,
    'instrument', r.instrument, 'difficulty', r.difficulty, 'license', r.license, 'sourceNote', r.source_note,
    'versionId', v.id, 'publishedAt', v.created_at, 'musicxml', v.musicxml)
  from public.library_score_rows() r join public.score_versions v on v.id = r.published_version_id
  where r.score_id = p_score_id
$$;

-- Grants ---------------------------------------------------------------------------------------
revoke all on table public.library_scores from public, anon, authenticated, service_role;
grant select on table public.library_scores to anon, authenticated;

revoke all on function public.library_score_rows() from public, anon, authenticated, service_role;
revoke all on function public.library_score_open(uuid) from public, anon, authenticated, service_role;
revoke all on function public.score_create(text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.score_attach_source(uuid, text, bigint, integer, integer[]) from public, anon, authenticated, service_role;
revoke all on function public.score_request_recognition(uuid) from public, anon, authenticated, service_role;
revoke all on function public.score_save_correction(uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function public.score_submit_for_review(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.score_delete(uuid) from public, anon, authenticated, service_role;
revoke all on function public.score_report_error(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.score_review(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.score_publish_fix(uuid, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.score_report_dismiss(uuid) from public, anon, authenticated, service_role;
revoke all on function public.score_job_claim(integer) from public, anon, authenticated, service_role;
revoke all on function public.score_job_progress(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.score_job_finish(uuid, uuid, boolean, text, text, text, jsonb, text) from public, anon, authenticated, service_role;

grant execute on function public.library_score_rows() to anon, authenticated;
grant execute on function public.library_score_open(uuid) to anon, authenticated;
grant execute on function public.score_create(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.score_attach_source(uuid, text, bigint, integer, integer[]) to authenticated;
grant execute on function public.score_request_recognition(uuid) to authenticated;
grant execute on function public.score_save_correction(uuid, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.score_submit_for_review(uuid, text, text) to authenticated;
grant execute on function public.score_delete(uuid) to authenticated;
grant execute on function public.score_report_error(uuid, integer, text) to authenticated;
-- Admin RPCs are granted to authenticated and check public.is_app_admin() themselves.
grant execute on function public.score_review(uuid, text, text, jsonb) to authenticated;
grant execute on function public.score_publish_fix(uuid, text, uuid[]) to authenticated;
grant execute on function public.score_report_dismiss(uuid) to authenticated;
grant execute on function public.score_job_claim(integer) to service_role;
grant execute on function public.score_job_progress(uuid, uuid, integer) to service_role;
grant execute on function public.score_job_finish(uuid, uuid, boolean, text, text, text, jsonb, text) to service_role;

-- Storage (skipped where the storage schema does not exist, e.g. local PGlite/Docker checks) -----
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present: score-sources bucket and policies skipped';
    return;
  end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('score-sources', 'score-sources', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg',
      'application/vnd.recordare.musicxml+xml', 'application/vnd.recordare.musicxml'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists "score-sources owner insert" on storage.objects';
  execute 'drop policy if exists "score-sources owner read" on storage.objects';
  execute 'drop policy if exists "score-sources owner delete" on storage.objects';
  -- Upload only into the caller's own folder, as {uid}/{hash}.{ext}, for a score the caller owns.
  execute $p$create policy "score-sources owner insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'score-sources'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and name ~ '^[0-9a-f-]{36}/[a-f0-9]{64}\.(pdf|png|jpg|musicxml|mxl)$'
      and exists (select 1 from public.scores s where s.owner_id = (select auth.uid())
        and s.source_hash = substring(name from '/([a-f0-9]{64})\.')))$p$;
  execute $p$create policy "score-sources owner read" on storage.objects for select to authenticated
    using (bucket_id = 'score-sources'
      and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_app_admin())))$p$;
  execute $p$create policy "score-sources owner delete" on storage.objects for delete to authenticated
    using (bucket_id = 'score-sources' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
end
$storage$;

commit;
