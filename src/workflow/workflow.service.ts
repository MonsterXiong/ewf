import { sha256Hex, stableStringify } from "./digest";
import { DraftDefaultsService } from "./draft-defaults.service";
import { DraftNormalizeService } from "./draft-normalize.service";
import { PluginCompilerService } from "./compiler.plugin.service";
import { WorkflowRepo, HttpTrigger } from "./workflow.repo";

export class WorkflowService {
  private readonly dns?: DraftNormalizeService;

  constructor(
    private readonly repo: WorkflowRepo,
    private readonly compilerBridge: any,
    private readonly pcs?: PluginCompilerService,
    dns?: DraftNormalizeService
  ) {
    this.dns = dns;
  }

  // ===== Draft APIs =====
  async saveDraft(workflowId: string, draft: any) {
    await this.repo.saveDraft(workflowId, draft);
    return { workflowId };
  }

  async getDraft(workflowId: string) {
    const d = await this.repo.loadDraft(workflowId);
    return d ?? null;
  }

  // ===== Release APIs =====
  async listReleases(workflowId: string) {
    return this.repo.listReleases(workflowId);
  }

  async getActive(workflowId: string) {
    const v = await this.repo.getActiveVersion(workflowId);
    return { workflowId, version: v };
  }

  async rollback(workflowId: string, steps: number = 1) {
    const cur = await this.repo.getActiveVersion(workflowId);
    if (cur == null) throw new Error("WORKFLOW_NOT_ACTIVE");

    const target = Math.max(1, Number(cur) - Math.max(1, Number(steps || 1)));

    // 确保目标版本存在
    const ver = await this.repo.loadVersion(workflowId, target);
    if (!ver) throw new Error("WORKFLOW_VERSION_NOT_FOUND");

    await this.repo.setActive(workflowId, target);
    return { workflowId, version: target };
  }

  // ===== publish/activate =====

  private getNormalizer(): DraftNormalizeService | null {
    // Nest 注入优先
    if (this.dns) return this.dns;

    // 兼容“手动 new WorkflowService(repo, compiler)”的老单测：没有 pcs 时无法构建 plugin normalizer
    if (!this.pcs) return null;

    return new DraftNormalizeService(new DraftDefaultsService(), this.pcs);
  }

  private extractHttpTriggersStrict(draft: any): HttpTrigger[] {
    const list = Array.isArray(draft?.triggers) ? draft.triggers : [];
    const out: HttpTrigger[] = [];

    for (const t of list) {
      if (!t) continue;
      const type = String(t.type ?? "http");
      if (type !== "http") continue;

      const method = String(t.method ?? "POST").toUpperCase();
      const path = String(t.path ?? "");

      if (!path.startsWith("/internal/api/")) {
        throw new Error(`TRIGGER_PATH_FORBIDDEN ${method} ${path} (must start with /internal/api/)`);
      }

      out.push({ method, path });
    }

    // 去重 + 稳定排序
    const m = new Map<string, HttpTrigger>();
    for (const x of out) m.set(`${x.method}|${x.path}`, x);
    return [...m.values()].sort((a, b) => `${a.method}|${a.path}`.localeCompare(`${b.method}|${b.path}`));
  }

  /**
   * ✅ 保持和 controller 兼容的签名：
   * publish(workflowId, body?.draft, { force })
   */
  async publish(workflowId: string, draftOverride?: any, opts?: { force?: boolean }) {
    // 1) draft 来源：优先 override，否则从库加载
    const draft = draftOverride ?? (await this.repo.loadDraft(workflowId));
    if (!draft) throw new Error("DRAFT_NOT_FOUND");

    // 如果传了 draftOverride，保持行为可预期：写回为当前 draft
    if (draftOverride) {
      await this.repo.saveDraft(workflowId, draftOverride);
    }

    // 2) normalize + digest（如果 normalizer 可用；否则降级为直接用 draft）
    const normalizer = this.getNormalizer();
    const normalizedDraft = normalizer ? normalizer.normalizeDraft(draft).draft : draft;

    const draftSha256 = sha256Hex(stableStringify(normalizedDraft));

    // 3) ✅ 幂等 publish：同 draftSha 复用版本
    const existed = await this.repo.findVersionByDraftSha(workflowId, draftSha256);
    if (existed != null) {
      return { workflowId, version: existed, reused: true, digest: { draftSha256 } };
    }

    // 4) triggers upsert（含冲突检查；force 覆盖）
    const triggers = this.extractHttpTriggersStrict(normalizedDraft);
    await this.repo.upsertTriggersForWorkflow(workflowId, triggers, { force: Boolean(opts?.force) });

    // 5) compile IR（plugin 优先）
    let ir: any;
    const compiler = String(normalizedDraft?.compiler ?? "plugin");
    if (compiler === "plugin" && this.pcs) {
      ir = this.pcs.compile(normalizedDraft);
    } else {
      // 兼容旧编译桥
      ir = await this.compilerBridge.compile(normalizedDraft);
    }

    const irSha256 = sha256Hex(stableStringify(ir));

    // 6) insert version
    const nextVersion = (await this.repo.getMaxVersion(workflowId)) + 1;
    await this.repo.insertVersion({
      workflowId,
      version: nextVersion,
      ir,
      draft: normalizedDraft,
      draftSha256,
      irSha256,
    });

    return { workflowId, version: nextVersion, reused: false, digest: { draftSha256, irSha256 } };
  }

  async activate(workflowId: string, version: number) {
    const v = await this.repo.loadVersion(workflowId, Number(version));
    if (!v) throw new Error("WORKFLOW_VERSION_NOT_FOUND");
    await this.repo.setActive(workflowId, Number(version));
    return { workflowId, version: Number(version) };
  }
}
