import crypto from "crypto";

function stableStringify(x: any): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  const keys = Object.keys(x).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(x[k])).join(",") + "}";
}

function stripVolatileKeys(obj: any) {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) return obj.forEach(stripVolatileKeys);

  delete obj.compiledAt;
  delete obj.generatedAt;
  delete obj.buildId;
  delete obj.sourceFile;
  delete obj.irDigest;

  for (const k of Object.keys(obj)) stripVolatileKeys(obj[k]);
}

function canonicalizeLabels(ir: any) {
  const prog = ir?.program;
  if (!Array.isArray(prog)) return;

  const map = new Map<string, string>();
  let idx = 0;
  for (const ins of prog) {
    if (ins?.op === "LABEL" && typeof ins.name === "string") {
      if (!map.has(ins.name)) map.set(ins.name, `L${idx++}`);
    }
  }

  const rewrite = (v: any): any => {
    if (typeof v === "string" && map.has(v)) return map.get(v);
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === "object") {
      for (const k of Object.keys(v)) v[k] = rewrite(v[k]);
      return v;
    }
    return v;
  };

  for (const ins of prog) rewrite(ins);
}

export function computeIrDigest(ir: any): string {
  const cloned = JSON.parse(JSON.stringify(ir));
  stripVolatileKeys(cloned);

  const allow = cloned?.policies?.egress?.allowConnectors;
  if (Array.isArray(allow)) allow.sort();

  if (Array.isArray(cloned.triggers)) {
    cloned.triggers.sort((a: any, b: any) =>
      `${a.method || ""}:${a.path || ""}`.localeCompare(`${b.method || ""}:${b.path || ""}`)
    );
  }

  canonicalizeLabels(cloned);

  const s = stableStringify(cloned);
  return crypto.createHash("sha256").update(s).digest("hex");
}
