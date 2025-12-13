/* =========================
   EWF MySQL Schema (ewf)
   ========================= */

CREATE TABLE IF NOT EXISTS workflows (
  workflow_id VARCHAR(128) NOT NULL,
  draft_json  JSON NULL,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (workflow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_versions (
  workflow_id   VARCHAR(128) NOT NULL,
  version       INT NOT NULL,
  ir_json       JSON NOT NULL,
  draft_json    JSON NOT NULL,
  created_at    BIGINT NOT NULL,

  draft_sha256  VARCHAR(64) NULL,
  ir_sha256     VARCHAR(64) NULL,

  PRIMARY KEY (workflow_id, version),
  KEY idx_wf_draft_sha (workflow_id, draft_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_active (
  workflow_id     VARCHAR(128) NOT NULL,
  active_version  INT NOT NULL,
  updated_at      BIGINT NOT NULL,
  PRIMARY KEY (workflow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS triggers (
  method      VARCHAR(16) NOT NULL,
  path        VARCHAR(255) NOT NULL,
  workflow_id VARCHAR(128) NOT NULL,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (method, path),
  KEY idx_triggers_wf (workflow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS connector_configs (
  connector_id VARCHAR(64) NOT NULL,
  config_json  JSON NOT NULL,
  updated_at   BIGINT NOT NULL,
  PRIMARY KEY (connector_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS runs (
  run_id           VARCHAR(64) NOT NULL,
  workflow_id      VARCHAR(128) NOT NULL,
  workflow_version INT NOT NULL,
  status           VARCHAR(32) NOT NULL,
  pc               INT NOT NULL,
  ctx_json         JSON NOT NULL,
  output_json      JSON NULL,
  error_json       JSON NULL,
  waiting_json     JSON NULL,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL,
  PRIMARY KEY (run_id),
  KEY idx_runs_wf (workflow_id, workflow_version),
  KEY idx_runs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS waiting_index (
  event_key VARCHAR(255) NOT NULL,
  run_id    VARCHAR(64) NOT NULL,
  PRIMARY KEY (event_key),
  KEY idx_waiting_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS replay_records (
  id            BIGINT NOT NULL AUTO_INCREMENT,
  run_id        VARCHAR(64) NOT NULL,
  scope_id      VARCHAR(128) NOT NULL,
  step_id       VARCHAR(128) NOT NULL,
  kind          VARCHAR(32) NOT NULL,

  call_index    INT NULL,
  attempt_index INT NULL,
  resume_index  INT NULL,

  payload_json  JSON NULL,
  recorded_at   BIGINT NOT NULL,

  PRIMARY KEY (id),
  KEY idx_replay_lookup_call (run_id, scope_id, step_id, call_index, attempt_index),
  KEY idx_replay_lookup_wait (run_id, scope_id, step_id, resume_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
