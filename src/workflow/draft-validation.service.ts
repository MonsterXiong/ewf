import { Injectable } from "@nestjs/common";
import { createBuiltinRegistry } from "./plugins/builtin";
import { registerCustomPlugins } from "./plugins/custom";
import { NodeRegistry } from "./plugins/registry";
import { AuthoringGraph, AuthoringNode, InputHint, ValueExpr } from "./plugins/types";
import { validatePluginGraph } from "./plugin-graph.validator";

export type DraftValidationError = {
  code: string;
  message: string;
  path?: string;     // e.g. graph.nodes[n_id].inputs.body
  nodeId?: string;
  field?: string;
};

export type DraftValidationResult = {
  ok: boolean;
  errors: DraftValidationError[];
};

function err(code: string, message: string, extras?: Partial<DraftValidationError>): DraftValidationError {
  return { code, message, ...extras };
}

function isValueExpr(v: any): v is ValueExpr {
  if (!v || typeof v !== "object") return false;
  if ("const" in v) return true;
  if ("ref" in v && typeof v.ref === "string") return true;
  if ("expr" in v && v.expr && typeof v.expr === "object") return true;
  return false;
}

function constVal(v: any) {
  return v && typeof v === "object" && "const" in v ? (v as any).const : undefined;
}

function codeFromThrow(e: any) {
  const msg = String(e?.message ?? e);
  const first = msg.split(/\s+/)[0];
  // 常见错误码都是全大写或含下划线
  if (/^[A-Z0-9_]+$/.test(first)) return first;
  return "VALIDATION_ERROR";
}

function matchPattern(s: string, pattern: string) {
  try {
    const re = new RegExp(pattern);
    return re.test(s);
  } catch {
    return true; // pattern 写错不阻断（避免误伤）
  }
}

@Injectable()
export class DraftValidationService {
  private registry: NodeRegistry;

  constructor() {
    this.registry = registerCustomPlugins(createBuiltinRegistry());
  }

  validateDraft(draft: any): DraftValidationResult {
    const errors: DraftValidationError[] = [];

    const graph: AuthoringGraph | undefined = draft?.graph;
    if (!graph?.start?.nodeId) {
      return { ok: false, errors: [err("DRAFT_GRAPH_INVALID", "draft.graph.start.nodeId is required", { path: "graph.start.nodeId" })] };
    }

    // 结构化 DAG 校验（一次性给出清晰错误码）
    try {
      validatePluginGraph(graph, this.registry);
    } catch (e: any) {
      errors.push(err(codeFromThrow(e), String(e?.message ?? e), { path: "graph" }));
      // 结构错了后续也能继续做一些节点级校验（便于一次返回更多错误）
    }

    const nodes: AuthoringNode[] = graph.nodes ?? [];
    for (const n of nodes) {
      // plugin 是否存在
      let plugin: any;
      try {
        plugin = this.registry.mustGet(n.type, n.typeVersion);
      } catch (e: any) {
        errors.push(err(codeFromThrow(e), String(e?.message ?? e), { nodeId: n.id, path: `graph.nodes[${n.id}]` }));
        continue;
      }

      // plugin 自己的 validate（例如 conn.call 强制 connectorId/operationId const）
      try {
        plugin.validate?.(n);
      } catch (e: any) {
        errors.push(err(codeFromThrow(e), String(e?.message ?? e), { nodeId: n.id, path: `graph.nodes[${n.id}]` }));
      }

      // meta inputs：required/constOnly/const 类型规则
      const hints: InputHint[] = plugin?.meta?.inputs ?? [];
      const inputObj = n.inputs ?? {};

      for (const h of hints) {
        const v = (inputObj as any)[h.name];

        if (h.required && v == null) {
          errors.push(
            err(
              "NODE_INPUT_REQUIRED",
              `node ${n.id} missing inputs.${h.name}`,
              { nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}` }
            )
          );
          continue;
        }

        if (v == null) continue;

        if (!isValueExpr(v)) {
          errors.push(
            err(
              "NODE_INPUT_NOT_VALUE_EXPR",
              `node ${n.id} inputs.${h.name} must be ValueExpr`,
              { nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}` }
            )
          );
          continue;
        }

        if (h.constOnly && !("const" in (v as any))) {
          errors.push(
            err(
              "NODE_INPUT_MUST_CONST",
              `node ${n.id} inputs.${h.name} must be const`,
              { nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}` }
            )
          );
          continue;
        }

        // 只对 const 做静态规则校验（ref/expr 运行时才知道）
        if ("const" in (v as any)) {
          const cv = constVal(v);

          if (h.kind === "string" && cv != null && typeof cv !== "string") {
            errors.push(err("NODE_INPUT_TYPE_MISMATCH", `node ${n.id} inputs.${h.name} const must be string`, {
              nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
            }));
          }

          if (h.kind === "number" && cv != null && typeof cv !== "number") {
            errors.push(err("NODE_INPUT_TYPE_MISMATCH", `node ${n.id} inputs.${h.name} const must be number`, {
              nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
            }));
          }

          if (h.kind === "boolean" && cv != null && typeof cv !== "boolean") {
            errors.push(err("NODE_INPUT_TYPE_MISMATCH", `node ${n.id} inputs.${h.name} const must be boolean`, {
              nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
            }));
          }

          if (h.enum && cv != null && !h.enum.includes(cv)) {
            errors.push(err("NODE_INPUT_ENUM_VIOLATION", `node ${n.id} inputs.${h.name} const not in enum`, {
              nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
            }));
          }

          if (h.pattern && typeof cv === "string" && !matchPattern(cv, h.pattern)) {
            errors.push(err("NODE_INPUT_PATTERN_VIOLATION", `node ${n.id} inputs.${h.name} pattern mismatch`, {
              nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
            }));
          }

          if (typeof cv === "number") {
            if (h.min != null && cv < h.min) {
              errors.push(err("NODE_INPUT_MIN_VIOLATION", `node ${n.id} inputs.${h.name} < min`, {
                nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
              }));
            }
            if (h.max != null && cv > h.max) {
              errors.push(err("NODE_INPUT_MAX_VIOLATION", `node ${n.id} inputs.${h.name} > max`, {
                nodeId: n.id, field: h.name, path: `graph.nodes[${n.id}].inputs.${h.name}`
              }));
            }
          }
        }
      }
    }

    errors.sort((a, b) => String(a.path ?? "").localeCompare(String(b.path ?? "")));
    return { ok: errors.length === 0, errors };
  }
}
