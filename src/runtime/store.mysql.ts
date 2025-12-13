import type mysql from "mysql2/promise";
import { OnModuleDestroy } from "@nestjs/common";
import { createMySqlPoolFromEnv } from "./mysql.pool";
import { RunStore, ReplayRecord } from "./store";
import { RunState } from "./types";

function rndId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}`;
}

function parseJson(v: any) {
  if (v == null) return undefined;
  return typeof v === "string" ? JSON.parse(v) : v;
}

type RunStatus = RunState["status"];
const RUN_STATUS_SET = new Set<RunStatus>(["RUNNING", "WAITING", "SUCCEEDED", "FAILED"]);
function toRunStatus(v: any): RunStatus {
  const s = String(v);
  if (RUN_STATUS_SET.has(s as RunStatus)) return s as RunStatus;
  throw new Error(`DB_RUN_STATUS_INVALID status=${s}`);
}

export class MySqlRunStore implements RunStore, OnModuleDestroy {
  private pool: mysql.Pool;
  private ownedPool: boolean;

  constructor(pool?: mysql.Pool) {
    if (pool) {
      this.pool = pool;
      this.ownedPool = false;
    } else {
      this.pool = createMySqlPoolFromEnv() as unknown as mysql.Pool;
      this.ownedPool = true; // ✅ 自建的 pool 需要在 destroy 时关闭
    }
  }

  async onModuleDestroy() {
    if (this.ownedPool) {
      await this.pool.end();
    }
  }

  async createRun(workflowId: string, workflowVersion: number, initial: RunState): Promise<string> {
    const runId = rndId("run");
    initial.runId = runId;

    await this.pool.execute(
      `INSERT INTO runs (run_id, workflow_id, workflow_version, status, pc, ctx_json, output_json, error_json, waiting_json)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), NULL, NULL, NULL)`,
      [runId, workflowId, workflowVersion, initial.status, initial.pc, JSON.stringify(initial.ctx)]
    );

    return runId;
  }

  async save(state: RunState): Promise<void> {
    await this.pool.execute(
      `UPDATE runs
         SET status=?, pc=?, ctx_json=CAST(? AS JSON),
             output_json=CAST(? AS JSON),
             error_json=CAST(? AS JSON),
             waiting_json=CAST(? AS JSON)
       WHERE run_id=?`,
      [
        state.status,
        state.pc,
        JSON.stringify(state.ctx),
        state.output === undefined ? null : JSON.stringify(state.output),
        state.error === undefined ? null : JSON.stringify(state.error),
        state.waiting === undefined ? null : JSON.stringify(state.waiting),
        state.runId,
      ]
    );
  }

  async load(runId: string): Promise<RunState | null> {
    const [rows] = await this.pool.query(
      `SELECT run_id, workflow_id, workflow_version, status, pc,
              ctx_json, output_json, error_json, waiting_json
         FROM runs WHERE run_id=? LIMIT 1`,
      [runId]
    );

    const arr = rows as any[];
    if (!arr.length) return null;
    const r = arr[0];

    return {
      runId: String(r.run_id),
      workflowId: String(r.workflow_id),
      workflowVersion: Number(r.workflow_version),
      status: toRunStatus(r.status),
      pc: Number(r.pc),
      ctx: parseJson(r.ctx_json),
      output: parseJson(r.output_json),
      error: parseJson(r.error_json),
      waiting: parseJson(r.waiting_json),
    };
  }

  async indexWaiting(eventKey: string, runId: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO waiting_index (event_key, run_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE run_id=VALUES(run_id)`,
      [eventKey, runId]
    );
  }

  async findWaiting(eventKey: string): Promise<string | null> {
    const [rows] = await this.pool.query(
      `SELECT run_id FROM waiting_index WHERE event_key=? LIMIT 1`,
      [eventKey]
    );
    const arr = rows as any[];
    return arr.length ? String(arr[0].run_id) : null;
  }

  async clearWaiting(eventKey: string): Promise<void> {
    await this.pool.execute(`DELETE FROM waiting_index WHERE event_key=?`, [eventKey]);
  }

  async appendReplayRecord(rec: ReplayRecord): Promise<void> {
    const anyRec: any = rec;

    const stepId = anyRec.stepId ?? "";
    const callIndex = anyRec.callIndex ?? -1;
    const attemptIndex = anyRec.attemptIndex ?? -1;
    const resumeIndex = anyRec.resumeIndex ?? -1;
    const forkId = anyRec.forkId ?? "";

    await this.pool.execute(
      `INSERT INTO replay_records
        (run_id, kind, scope_id, step_id, call_index, attempt_index, resume_index, fork_id,
         branches, spec, req, outcome, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))`,
      [
        anyRec.runId,
        anyRec.kind,
        anyRec.scopeId ?? "main",
        stepId,
        callIndex,
        attemptIndex,
        resumeIndex,
        forkId,
        anyRec.branches ? JSON.stringify(anyRec.branches) : null,
        anyRec.spec ? JSON.stringify(anyRec.spec) : null,
        anyRec.req ? JSON.stringify(anyRec.req) : null,
        anyRec.outcome ? JSON.stringify(anyRec.outcome) : null,
        anyRec.payload ? JSON.stringify(anyRec.payload) : null,
      ]
    );
  }

  async getCallRecord(runId: string, scopeId: string, stepId: string, callIndex: number, attemptIndex: number) {
    const [rows] = await this.pool.query(
      `SELECT * FROM replay_records
        WHERE run_id=? AND kind='CALL' AND scope_id=? AND step_id=? AND call_index=? AND attempt_index=?
        ORDER BY id DESC
        LIMIT 1`,
      [runId, scopeId, stepId, callIndex, attemptIndex]
    );

    const arr = rows as any[];
    if (!arr.length) return null;
    return this.hydrateReplay(arr[0]);
  }

  async getWaitRecord(runId: string, scopeId: string, stepId: string, resumeIndex: number) {
    const [rows] = await this.pool.query(
      `SELECT * FROM replay_records
        WHERE run_id=? AND kind='WAIT_RESUME' AND scope_id=? AND step_id=? AND resume_index=?
        ORDER BY id DESC
        LIMIT 1`,
      [runId, scopeId, stepId, resumeIndex]
    );

    const arr = rows as any[];
    if (!arr.length) return null;
    return this.hydrateReplay(arr[0]);
  }

  private hydrateReplay(r: any): any {
    const parse = (x: any) => (x == null ? undefined : (typeof x === "string" ? JSON.parse(x) : x));
    return {
      kind: String(r.kind),
      runId: String(r.run_id),
      scopeId: String(r.scope_id),
      stepId: String(r.step_id),
      callIndex: Number(r.call_index),
      attemptIndex: Number(r.attempt_index),
      resumeIndex: Number(r.resume_index),
      forkId: String(r.fork_id),
      branches: parse(r.branches),
      spec: parse(r.spec),
      req: parse(r.req),
      outcome: parse(r.outcome),
      payload: parse(r.payload),
      recordedAt: new Date(r.recorded_at).getTime(),
    };
  }
}
