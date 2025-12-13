-- Workflows (draft + release + active pointer)
create table if not exists workflows_draft (
  workflow_id text primary key,
  draft_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists workflows_release (
  workflow_id text not null,
  workflow_version int not null,
  ir_digest text not null,
  authoring_json jsonb not null,
  ir_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workflow_id, workflow_version)
);

create table if not exists workflows_active (
  workflow_id text primary key,
  active_version int not null,
  updated_at timestamptz not null default now()
);

-- Runs
create table if not exists runs (
  run_id text primary key,
  workflow_id text not null,
  workflow_version int not null,
  status text not null,
  pc int not null,
  ctx_json jsonb not null,
  output_json jsonb,
  error_json jsonb,
  waiting_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Step runs (trace)
create table if not exists step_runs (
  run_id text not null,
  seq int not null,
  scope_id text not null default 'main',
  op text not null,
  step_id text,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  duration_ms int not null default 0,
  error_code text,
  error_detail jsonb,
  output_summary jsonb,
  primary key (run_id, seq)
);

-- Replay records (CALL attempts + WAIT resumes + fork plan)
create table if not exists replay_records (
  run_id text not null,
  kind text not null,                -- CALL | WAIT_RESUME | FORK_PLAN
  scope_id text not null default 'main',
  step_id text,
  call_index int,                    -- for CALL
  attempt_index int,                 -- for CALL attempt
  resume_index int,                  -- for WAIT_RESUME
  fork_id text,                      -- for FORK_PLAN
  branches jsonb,                    -- for FORK_PLAN
  spec jsonb,
  req jsonb,
  outcome jsonb,                     -- {ok:true,response:{...}} OR {ok:false,error:{...}}
  payload jsonb,                     -- for WAIT_RESUME
  recorded_at timestamptz not null default now(),
  primary key (run_id, kind, scope_id, coalesce(step_id,''), coalesce(call_index, -1), coalesce(attempt_index, -1), coalesce(resume_index, -1), coalesce(fork_id,''))
);

create table if not exists waiting_index (
  event_key text primary key,
  run_id text not null,
  updated_at timestamptz not null default now()
);
