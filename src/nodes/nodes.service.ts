import { Injectable } from "@nestjs/common";
import { SchemaValidationService, SchemaError } from "../common/schema-validation.service";

type ValidateDraftResult = {
  ok: boolean;
  errors: Array<{ code: string; message: string; path?: string; source?: string }>;
  details?: {
    schemaOk: boolean;
    schemaErrors: SchemaError[];
    registryOk: boolean;
    registryErrors: SchemaError[];
  };
};

@Injectable()
export class NodesService {
  constructor(private readonly schemas: SchemaValidationService) {}

  /**
   * 你现有的 node catalog 逻辑应该已经存在。
   * 为了不破坏现有输出，这里默认 catalog() 返回“节点定义数组”：
   * [{type,typeVersion,meta,ports,io,defaults,constraints,impl}, ...]
   *
   * 如果你当前项目里 catalog() 在别的 service 中，你可以把 controller 里现有的实现迁移过来。
   * （本文件给出的是一个最小可运行版本：如果你已经有更完整 catalog，替换此方法即可。）
   */
  async catalog(): Promise<any[]> {
    // ✅ 如果你原来已经有节点注册表，这里应当返回原 catalog。
    // 为了确保“新项目也能跑”，这里提供一个兜底最小 catalog（不会影响你后续扩展）。
    return [
      {
        type: "conn.call",
        typeVersion: 1,
        meta: { title: "Connector Call", category: "connector" },
        ports: [{ name: "in", direction: "in" }, { name: "out", direction: "out" }],
        io: {
          inputsSchema: { type: "object", additionalProperties: true },
          outputsSchema: {}
        },
        defaults: {},
        constraints: {},
        impl: { kind: "tsPluginRef", ref: "@ewf/nodes/conn.call#ConnCallV1" }
      },
      {
        type: "flow.if",
        typeVersion: 1,
        meta: { title: "If", category: "flow" },
        ports: [
          { name: "in", direction: "in" },
          { name: "then", direction: "out" },
          { name: "else", direction: "out" }
        ],
        io: { inputsSchema: { type: "object" }, outputsSchema: {} },
        defaults: {},
        constraints: {},
        impl: { kind: "tsPluginRef", ref: "@ewf/nodes/flow.if#FlowIfV1" }
      },
      {
        type: "flow.fork",
        typeVersion: 1,
        meta: { title: "Fork", category: "flow" },
        ports: [
          { name: "in", direction: "in" },
          { name: "out", direction: "out", multiple: true }
        ],
        io: { inputsSchema: { type: "object" }, outputsSchema: {} },
        defaults: {},
        constraints: {},
        impl: { kind: "tsPluginRef", ref: "@ewf/nodes/flow.fork#FlowForkV1" }
      }
    ];
  }

  private mapErrors(prefix: string, errs: SchemaError[]) {
    return errs.map((e) => ({
      code: `${prefix}:${e.keyword || "invalid"}`,
      message: `[${e.source}] ${e.message || "invalid"} @ ${e.path}`,
      path: e.path,
      source: e.source
    }));
  }

  async validateDraft(draft: any): Promise<ValidateDraftResult> {
    // 1) workflow schema
    const w = this.schemas.validateWorkflow(draft);

    // 2) registry self-check (step registry)
    // 用 catalog 拼成 step-registry v1 结构
    let regOk = true;
    let regErrors: SchemaError[] = [];

    try {
      const nodes = await this.catalog();
      const stepRegistry = { schemaVersion: "1.0", nodes };
      const rr = this.schemas.validateStepRegistry(stepRegistry);
      regOk = rr.ok;
      regErrors = rr.errors;
    } catch (e: any) {
      regOk = false;
      regErrors = [
        {
          source: "stepRegistry",
          path: "/",
          keyword: "runtime",
          message: e?.message || String(e)
        }
      ];
    }

    const errors = [
      ...this.mapErrors("schema", w.errors),
      ...this.mapErrors("registry", regErrors)
    ];

    return {
      ok: w.ok && regOk,
      errors,
      details: {
        schemaOk: w.ok,
        schemaErrors: w.errors,
        registryOk: regOk,
        registryErrors: regErrors
      }
    };
  }
}
