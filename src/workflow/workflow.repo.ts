import { Pool } from "mysql2/promise";
import { sha256Hex, stableStringify } from "./digest";

export type HttpTrigger = { method: string; path: string };

export class WorkflowRepo {
  constructor(private readonly pool: Pool) {}

  // ===== Draft =====
  async saveDraft(workflowId: string, draft: any) {
    const now = Date.now();
    await this.pool.execute(
      `INSERT INTO workflows (workflow_id, draft_json, updated_at)
       VALUES (?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE draft_json=VALUES(draft_json), updated_at=VALUES(updated_at)`,
      [workflowId, JSON.stringify(draft), now]
    );
  }

  async loadDraft(workflowId: string): Promise<any | null> {
    const [rows] = (await this.pool.query(
      `SELECT draft_json FROM workflows WHERE workflow_id=? LIMIT 1`,
      [workflowId]
    )) as any;

    if (!rows?.length) return null;
    return rows[0].draft_json;
  }

  // ===== Versions =====
  async findVersionByDraftSha(workflowId: string, draftSha256: string): Promise<number | null> {
    const [rows] = (await this.pool.query(
      `SELECT version FROM workflow_versions
       WHERE workflow_id=? AND draft_sha256=?
       ORDER BY version DESC LIMIT 1`,
      [workflowId, draftSha256]
    )) as any;

    if (!rows?.length) return null;
    return Number(rows[0].version);
  }

  async getMaxVersion(workflowId: string): Promise<number> {
    const [rows] = (await this.pool.query(
      `SELECT COALESCE(MAX(version),0) AS mv FROM workflow_versions WHERE workflow_id=?`,
      [workflowId]
    )) as any;
    return Number(rows?.[0]?.mv ?? 0);
  }

  async insertVersion(params: {
    workflowId: string;
    version: number;
    ir: any;
    draft: any;
    draftSha256: string;
    irSha256: string;
  }) {
    const now = Date.now();
    await this.pool.execute(
      `INSERT INTO workflow_versions
       (workflow_id, version, ir_json, draft_json, draft_sha256, ir_sha256, created_at)
       VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?)`,
      [
        params.workflowId,
        params.version,
        JSON.stringify(params.ir),
        JSON.stringify(params.draft),
        params.draftSha256,
        params.irSha256,
        now,
      ]
    );
  }

  // ✅ 兼容旧测试：repo.publishRelease(wfId, draft, ir, digest)
  async publishRelease(workflowId: string, draft: any, ir: any, digest?: any) {
    const nextVersion = (await this.getMaxVersion(workflowId)) + 1;

    // digest 兼容多形态：object / string / undefined
    let draftSha256: string | undefined = digest?.draftSha256;
    let irSha256: string | undefined = digest?.irSha256;

    if (typeof digest === "string") {
      // 旧测试如果传的是单个 digest，优先当作 irSha
      irSha256 = digest;
    }

    if (!draftSha256) draftSha256 = sha256Hex(stableStringify(draft));
    if (!irSha256) irSha256 = sha256Hex(stableStringify(ir));

    await this.insertVersion({
      workflowId,
      version: nextVersion,
      ir,
      draft,
      draftSha256,
      irSha256,
    });

    return { workflowId, version: nextVersion, digest: { draftSha256, irSha256 } };
  }

  async loadIr(workflowId: string, version: number): Promise<any | null> {
    const [rows] = (await this.pool.query(
      `SELECT ir_json FROM workflow_versions WHERE workflow_id=? AND version=? LIMIT 1`,
      [workflowId, version]
    )) as any;

    if (!rows?.length) return null;
    return rows[0].ir_json;
  }

  async loadVersion(workflowId: string, version: number): Promise<{ ir: any; draft: any } | null> {
    const [rows] = (await this.pool.query(
      `SELECT ir_json, draft_json FROM workflow_versions WHERE workflow_id=? AND version=? LIMIT 1`,
      [workflowId, version]
    )) as any;

    if (!rows?.length) return null;
    return { ir: rows[0].ir_json, draft: rows[0].draft_json };
  }

  async listReleases(workflowId: string) {
    const [rows] = (await this.pool.query(
      `SELECT version, created_at, draft_sha256, ir_sha256
       FROM workflow_versions
       WHERE workflow_id=?
       ORDER BY version DESC`,
      [workflowId]
    )) as any;

    return (rows ?? []).map((r: any) => ({
      workflowId,
      version: Number(r.version),
      createdAt: Number(r.created_at),
      digest: { draftSha256: r.draft_sha256 ?? null, irSha256: r.ir_sha256 ?? null },
    }));
  }

  // ===== Active =====
  async setActive(workflowId: string, version: number) {
    const now = Date.now();
    await this.pool.execute(
      `INSERT INTO workflow_active (workflow_id, active_version, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE active_version=VALUES(active_version), updated_at=VALUES(updated_at)`,
      [workflowId, version, now]
    );
  }

  async getActiveVersion(workflowId: string): Promise<number | null> {
    const [rows] = (await this.pool.query(
      `SELECT active_version FROM workflow_active WHERE workflow_id=? LIMIT 1`,
      [workflowId]
    )) as any;

    if (!rows?.length) return null;
    return Number(rows[0].active_version);
  }

  async getActiveIr(workflowId: string): Promise<{ workflowId: string; version: number; ir: any } | null> {
    const v = await this.getActiveVersion(workflowId);
    if (v == null) return null;

    const ir = await this.loadIr(workflowId, v);
    if (!ir) return null;

    return { workflowId, version: v, ir };
  }

  // ✅ backward-compatible alias for controller/tests
  async findWorkflowIdByTrigger(method: string, path: string): Promise<string | null> {
    return this.resolveWorkflowIdByTrigger(method, path);
  }
  // ✅ backward-compatible alias for EventService / older code
  async getRelease(workflowId: string, version: number): Promise<{ ir: any; draft: any } | null> {
    return this.loadVersion(workflowId, Number(version));
  }

  // ===== Triggers =====
  /**
   * ✅ 兼容两种调用：
   * - upsertTriggersForWorkflow(wfId, triggers, true)
   * - upsertTriggersForWorkflow(wfId, triggers, { force: true })
   */
  async upsertTriggersForWorkflow(
    workflowId: string,
    triggers: HttpTrigger[],
    opts?: boolean | { force?: boolean }
  ) {
    const force = typeof opts === "boolean" ? opts : Boolean(opts?.force);
    const now = Date.now();

    // 1) delete triggers previously owned by this workflow but not in new set
    const [oldRows] = (await this.pool.query(
      `SELECT method, path FROM triggers WHERE workflow_id=?`,
      [workflowId]
    )) as any;

    const newKey = new Set(triggers.map((t) => `${String(t.method).toUpperCase()}|${String(t.path)}`));
    const toDelete = (oldRows ?? []).filter((r: any) => !newKey.has(`${r.method}|${r.path}`));

    if (toDelete.length) {
      const placeholders = toDelete.map(() => "(?, ?)").join(",");
      const args: any[] = [];
      for (const r of toDelete) {
        args.push(String(r.method), String(r.path));
      }
      await this.pool.execute(`DELETE FROM triggers WHERE (method, path) IN (${placeholders})`, args);
    }

    // 2) upsert all new triggers with conflict check
    for (const t of triggers) {
      const method = String(t.method).toUpperCase();
      const path = String(t.path);

      const [rows] = (await this.pool.query(
        `SELECT workflow_id FROM triggers WHERE method=? AND path=? LIMIT 1`,
        [method, path]
      )) as any;

      if (rows?.length && String(rows[0].workflow_id) !== workflowId) {
        const owner = String(rows[0].workflow_id);
        if (!force) {
          throw new Error(`TRIGGER_CONFLICT ${method} ${path} -> ${owner}`);
        }
      }

      await this.pool.execute(
        `INSERT INTO triggers (method, path, workflow_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE workflow_id=VALUES(workflow_id), updated_at=VALUES(updated_at)`,
        [method, path, workflowId, now]
      );
    }
  }

  async resolveWorkflowIdByTrigger(method: string, path: string): Promise<string | null> {
    const [rows] = (await this.pool.query(
      `SELECT workflow_id FROM triggers WHERE method=? AND path=? LIMIT 1`,
      [String(method).toUpperCase(), String(path)]
    )) as any;

    if (!rows?.length) return null;
    return String(rows[0].workflow_id);
  }
}
