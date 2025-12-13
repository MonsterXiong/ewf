import mysql from "mysql2/promise";

export class AuditRepo {
  constructor(private readonly pool: mysql.Pool) {}

  async listRuns(params: { workflowId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(Number(params.limit ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(params.offset ?? 0) || 0, 0);

    const where: string[] = [];
    const args: any[] = [];

    if (params.workflowId) { where.push("workflow_id=?"); args.push(params.workflowId); }
    if (params.status) { where.push("status=?"); args.push(params.status); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // ✅ LIMIT/OFFSET 用内联整数，避免部分 MySQL 不支持占位符
    const sql =
      `SELECT run_id, workflow_id, workflow_version, status, pc, updated_at
         FROM runs
         ${whereSql}
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await this.pool.query(sql, args);
    const arr = rows as any[];

    return arr.map((r) => ({
      runId: String(r.run_id),
      workflowId: String(r.workflow_id),
      workflowVersion: Number(r.workflow_version),
      status: String(r.status),
      pc: Number(r.pc),
      updatedAt: String(r.updated_at),
    }));
  }

  async getRun(runId: string) {
    const [rows] = await this.pool.query<any[]>(
      `SELECT run_id, workflow_id, workflow_version, status, pc,
              ctx_json, output_json, error_json, waiting_json, created_at, updated_at
         FROM runs WHERE run_id=? LIMIT 1`,
      [runId]
    );

    const arr = rows as any[];
    if (!arr.length) return null;

    const r = arr[0];
    const parse = (v: any) => (v == null ? undefined : (typeof v === "string" ? JSON.parse(v) : v));

    return {
      runId: String(r.run_id),
      workflowId: String(r.workflow_id),
      workflowVersion: Number(r.workflow_version),
      status: String(r.status),
      pc: Number(r.pc),
      ctx: parse(r.ctx_json),
      output: parse(r.output_json),
      error: parse(r.error_json),
      waiting: parse(r.waiting_json),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listReplayRecords(runId: string, params?: { kind?: string; stepId?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(Number(params?.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(params?.offset ?? 0) || 0, 0);

    const where: string[] = ["run_id=?"];
    const args: any[] = [runId];

    if (params?.kind) { where.push("kind=?"); args.push(params.kind); }
    if (params?.stepId) { where.push("step_id=?"); args.push(params.stepId); }

    const sql =
      `SELECT id, kind, scope_id, step_id, call_index, attempt_index, resume_index, fork_id,
              branches, spec, req, outcome, payload, recorded_at
         FROM replay_records
        WHERE ${where.join(" AND ")}
        ORDER BY id ASC
        LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await this.pool.query(sql, args);
    const arr = rows as any[];
    const parse = (v: any) => (v == null ? undefined : (typeof v === "string" ? JSON.parse(v) : v));

    return arr.map((r) => ({
      id: Number(r.id),
      kind: String(r.kind),
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
      recordedAt: String(r.recorded_at),
    }));
  }
}
