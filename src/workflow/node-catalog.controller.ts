import { Body, Controller, Get, Post, HttpCode } from "@nestjs/common";
import { PluginCompilerService } from "./compiler.plugin.service";
import { DraftValidationService } from "./draft-validation.service";
import { DraftDefaultsService } from "./draft-defaults.service";
import { DraftNormalizeService } from "./draft-normalize.service";
import { SchemaValidationService, SchemaError } from "../common/schema-validation.service";

type ValidateDraftBase = {
  ok: boolean;
  errors: any[];
  [k: string]: any;
};

type RegistryWarning = {
  index: number;
  message: string;
  raw?: any;
};

@Controller("/internal/nodes")
export class NodeCatalogController {
  constructor(
    private readonly pcs: PluginCompilerService,
    private readonly dvs: DraftValidationService,
    private readonly dds: DraftDefaultsService,
    private readonly dns: DraftNormalizeService,
    private readonly svs: SchemaValidationService
  ) {}

  @Get("/catalog")
  catalog() {
    return this.pcs.catalog();
  }

  private mapSchemaErrors(errs: SchemaError[]) {
    return errs.map((e) => ({
      code: `schema:${e.keyword || "invalid"}`,
      message: `[${e.source}] ${e.message || "invalid"} @ ${e.path}`,
      path: e.path,
      source: e.source,
      params: e.params
    }));
  }

  private normalizeOneNode(n: any, idx: number, warnings: RegistryWarning[]) {
    const raw = n;

    // 兼容各种可能的字段命名
    let type =
      raw?.type ??
      raw?.nodeType ??
      raw?.kind ??
      raw?.key ??
      raw?.name ??
      raw?.meta?.type;

    let typeVersion =
      raw?.typeVersion ??
      raw?.nodeVersion ??
      raw?.version ??
      raw?.v ??
      raw?.meta?.version;

    if (type == null || String(type).trim().length === 0) {
      warnings.push({
        index: idx,
        message: "node missing `type` (using fallback __unknown__)",
        raw
      });
      type = `__unknown__:${idx}`;
    } else {
      type = String(type);
    }

    if (typeof typeVersion === "string") {
      const parsed = Number.parseInt(typeVersion, 10);
      if (!Number.isFinite(parsed)) {
        warnings.push({
          index: idx,
          message: `node typeVersion is not a number (${typeVersion}); fallback to 1`,
          raw
        });
        typeVersion = 1;
      } else {
        typeVersion = parsed;
      }
    }

    if (typeof typeVersion !== "number" || !Number.isFinite(typeVersion)) {
      warnings.push({
        index: idx,
        message: "node missing `typeVersion` (fallback to 1)",
        raw
      });
      typeVersion = 1;
    }

    if (typeVersion < 1) {
      warnings.push({
        index: idx,
        message: `node typeVersion < 1 (${typeVersion}); fallback to 1`,
        raw
      });
      typeVersion = 1;
    }

    // 返回“原对象 + 归一化字段”，不丢你的扩展字段
    return { ...raw, type, typeVersion };
  }

  private normalizeStepRegistry(catalog: any) {
    const warnings: RegistryWarning[] = [];

    // 兼容 catalog 的多种形态
    let schemaVersion = "1.0";
    let nodes: any[] = [];

    if (Array.isArray(catalog)) {
      nodes = catalog;
    } else if (catalog && typeof catalog === "object") {
      schemaVersion = String((catalog as any).schemaVersion || (catalog as any).version || "1.0");
      nodes =
        (catalog as any).nodes ??
        (catalog as any).items ??
        (catalog as any).catalog ??
        (catalog as any).nodeCatalog ??
        [];
    }

    if (!Array.isArray(nodes)) nodes = [];

    const normalizedNodes = nodes.map((n, i) => this.normalizeOneNode(n, i, warnings));

    const stepRegistry = {
      schemaVersion,
      nodes: normalizedNodes
    };

    return { stepRegistry, warnings };
  }

  @Post("/validate-draft")
  @HttpCode(200)
  async validateDraft(@Body() draft: any) {
    // ✅ 1) 保持你原有 validateDraft 行为（不破坏主线）
    const base: ValidateDraftBase = await Promise.resolve(this.dvs.validateDraft(draft) as any);
    const out: ValidateDraftBase = {
      ...base,
      ok: Boolean(base?.ok),
      errors: Array.isArray(base?.errors) ? base.errors : []
    };

    // ✅ 2) Workflow DSL schema 校验：仅对新 DSL 生效（避免误伤旧 draft）
    let schemaOk = true;
    let schemaErrors: SchemaError[] = [];
    try {
      if (draft?.kind === "ewf.workflow" && String(draft?.schemaVersion || "") === "1.0") {
        const r = this.svs.validateWorkflow(draft);
        schemaOk = r.ok;
        schemaErrors = r.errors;
      }
    } catch (e: any) {
      schemaOk = false;
      schemaErrors = [{ source: "workflow", path: "/", keyword: "runtime", message: e?.message || String(e) }];
    }

    // ✅ 3) Step registry self-check：做强兼容归一化，确保不会被字段命名卡住
    let registryOk = true;
    let registryErrors: SchemaError[] = [];
    let registryWarnings: RegistryWarning[] = [];
    try {
      const cat = await Promise.resolve(this.pcs.catalog() as any);
      const norm = this.normalizeStepRegistry(cat);
      registryWarnings = norm.warnings;

      const rr = this.svs.validateStepRegistry(norm.stepRegistry);
      registryOk = rr.ok;
      registryErrors = rr.errors;
    } catch (e: any) {
      registryOk = false;
      registryErrors = [{ source: "stepRegistry", path: "/", keyword: "runtime", message: e?.message || String(e) }];
    }

    // ✅ 4) schema 不通过：合并到顶层 errors，并强制 ok=false
    if (!schemaOk) {
      out.ok = false;
      out.errors = [...out.errors, ...this.mapSchemaErrors(schemaErrors)];
    }

    // ✅ 5) details（增强字段）
    (out as any).details = {
      schemaOk,
      schemaErrors,
      registryOk,
      registryErrors,
      registryWarnings
    };

    return out;
  }

  @Post("/apply-defaults")
  @HttpCode(200)
  applyDefaults(@Body() draft: any) {
    return this.dds.applyDefaults(draft);
  }

  @Post("/normalize-draft")
  @HttpCode(200)
  normalizeDraft(@Body() draft: any) {
    return this.dns.normalizeDraft(draft);
  }
}
