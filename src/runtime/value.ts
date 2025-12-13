import jsonata from "jsonata";
import { Value } from "./types";

function getByPath(obj: any, p: string) {
  const parts = p.split(".").filter(Boolean);
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export async function evalValue(v: Value, ctx: any): Promise<any> {
  if (!v || typeof v !== "object") return v;
  if ("const" in v) return v.const;
  if ("ref" in v) return getByPath(ctx, v.ref);
  if ("secretRef" in v) {
    // MVP：不做真实 secrets 管理；生产版在这里注入
    return `__SECRET__:${v.secretRef.key}`;
  }
  if ("expr" in v) {
    if (v.expr.lang !== "jsonata") throw new Error(`unsupported expr lang: ${v.expr.lang}`);
    const expr = jsonata(v.expr.body);
    return await expr.evaluate(ctx);
  }
  return v;
}

// 将 inputs 映射写入 req（支持 "body" 和 "params.id" 这种）
export function applyInput(req: any, key: string, val: any) {
  if (key === "body") { req.body = val; return; }
  const [root, ...rest] = key.split(".");
  if (!req[root]) req[root] = {};
  let cur = req[root];
  for (let i=0;i<rest.length-1;i++){
    const k = rest[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[rest[rest.length-1]] = val;
}

export function getScopeId(ctx: any) {
  return ctx?.env?.__scopeId ?? "main";
}

export function bumpCounter(ctx: any, kind: "CALL" | "WAIT_RESUME", scopeId: string, stepId: string): number {
  const key = `${kind}:${scopeId}:${stepId}`;
  if (!ctx.env.__counters) ctx.env.__counters = {};
  const cur = ctx.env.__counters[key] ?? 0;
  ctx.env.__counters[key] = cur + 1;
  return cur;
}
