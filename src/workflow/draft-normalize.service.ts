import { Injectable } from "@nestjs/common";
import { DraftDefaultsService } from "./draft-defaults.service";
import { PluginCompilerService } from "./compiler.plugin.service";
import { stableStringify, sha256Hex } from "./digest";

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function isValueExpr(v: any) {
  return v && typeof v === "object" && ("const" in v || "ref" in v || "expr" in v);
}

function normalizeValueExpr(v: any) {
  // 兼容：如果有人直接写了 primitive/object，当作 const
  if (!isValueExpr(v)) return { const: v };

  if ("const" in v) return { const: (v as any).const };

  if ("ref" in v) return { ref: String((v as any).ref) };

  if ("expr" in v) {
    const e = (v as any).expr ?? {};
    return { expr: { lang: "jsonata", body: String(e.body ?? "") } };
  }

  return { const: v };
}

function sortObjectKeys(obj: any): any {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);

  const out: any = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v === undefined) continue;
    out[k] = sortObjectKeys(v);
  }
  return out;
}

@Injectable()
export class DraftNormalizeService {
  constructor(
    private readonly defaults: DraftDefaultsService,
    private readonly pcs: PluginCompilerService
  ) {}

  normalizeDraft(draft: any) {
    // 1) clone + apply defaults
    let d = deepClone(draft);
    d = this.defaults.applyDefaults(d);

    // 2) normalize minimal shape
    if (!d.graph) d.graph = { start: { nodeId: "", port: "in" }, nodes: [], edges: [] };
    if (!d.graph.nodes) d.graph.nodes = [];
    if (!d.graph.edges) d.graph.edges = [];
    if (!d.graph.start) d.graph.start = { nodeId: "", port: "in" };
    if (!d.graph.start.port) d.graph.start.port = "in";

    // 3) normalize nodes (sort by id; inputs keys sorted; valueexpr canonical)
    d.graph.nodes = (d.graph.nodes as any[])
      .map((n) => {
        const nn = deepClone(n);
        nn.id = String(nn.id);
        nn.type = String(nn.type);
        nn.typeVersion = Number(nn.typeVersion ?? 1);

        const inputs = nn.inputs ?? {};
        const normInputs: any = {};
        for (const k of Object.keys(inputs).sort()) {
          normInputs[k] = normalizeValueExpr(inputs[k]);
        }
        nn.inputs = normInputs;

        return sortObjectKeys(nn);
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    // 4) normalize edges order
    d.graph.edges = (d.graph.edges as any[])
      .map((e) => ({
        from: { nodeId: String(e.from?.nodeId), port: String(e.from?.port) },
        to: { nodeId: String(e.to?.nodeId), port: String(e.to?.port) },
      }))
      .sort((a, b) => {
        const ka = `${a.from.nodeId}|${a.from.port}|${a.to.nodeId}|${a.to.port}`;
        const kb = `${b.from.nodeId}|${b.from.port}|${b.to.nodeId}|${b.to.port}`;
        return ka.localeCompare(kb);
      });

    // ✅ normalize triggers order + method casing
    if (Array.isArray((d as any).triggers)) {
      (d as any).triggers = (d as any).triggers
        .map((t: any) => ({
          ...t,
          type: String(t.type ?? "http"),
          method: t.method ? String(t.method).toUpperCase() : undefined,
          path: t.path ? String(t.path) : undefined,
        }))
        .sort((a: any, b: any) => {
          const ka = `${a.type}|${a.method ?? ""}|${a.path ?? ""}`;
          const kb = `${b.type}|${b.method ?? ""}|${b.path ?? ""}`;
          return ka.localeCompare(kb);
        });
    }

    // ✅ normalize allowConnectors order
    const allow = (d as any)?.policies?.egress?.allowConnectors;
    if (Array.isArray(allow)) {
      (d as any).policies.egress.allowConnectors = [...allow].map(String).sort();
    }

    // 5) whole draft stable key ordering
    d = sortObjectKeys(d);

    const draftStr = stableStringify(d);
    const draftSha256 = sha256Hex(draftStr);

    // 6) optional: try compute ir digest
    let irSha256: string | undefined;
    try {
      if ((d.compiler ?? "plugin") === "plugin") {
        const ir = this.pcs.compile(d);
        irSha256 = sha256Hex(stableStringify(ir));
      }
    } catch {
      // normalize 不强制要求 compile 成功；校验走 validate-draft
    }

    return {
      draft: d,
      digest: { draftSha256, irSha256 },
    };
  }
}
