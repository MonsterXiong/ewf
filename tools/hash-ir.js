const fs = require("fs");
const crypto = require("crypto");

function stableStringify(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  const keys = Object.keys(x).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(x[k])).join(",") + "}";
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function stripVolatileKeys(obj) {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) return obj.forEach(stripVolatileKeys);

  // 常见不稳定字段：无论在哪一层都去掉
  delete obj.compiledAt;
  delete obj.generatedAt;
  delete obj.buildId;
  delete obj.sourceFile;
  delete obj.irDigest;

  for (const k of Object.keys(obj)) stripVolatileKeys(obj[k]);
}

function canonicalizeLabels(ir) {
  const prog = ir.program;
  if (!Array.isArray(prog)) return;

  const map = new Map();
  let idx = 0;
  for (const ins of prog) {
    if (ins && ins.op === "LABEL" && typeof ins.name === "string") {
      if (!map.has(ins.name)) map.set(ins.name, `L${idx++}`);
    }
  }

  const rewrite = (v) => {
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

function normalizeIr(ir) {
  const x = deepClone(ir);

  stripVolatileKeys(x);

  const allow = x?.policies?.egress?.allowConnectors;
  if (Array.isArray(allow)) allow.sort();

  if (Array.isArray(x.triggers)) {
    x.triggers.sort((a, b) => `${a.method||""}:${a.path||""}`.localeCompare(`${b.method||""}:${b.path||""}`));
  }

  canonicalizeLabels(x);
  return x;
}

function main() {
  const p = process.argv[2];
  if (!p) {
    console.error("usage: node tools/hash-ir.js <path-to-ir.json>");
    process.exit(1);
  }
  const ir = JSON.parse(fs.readFileSync(p, "utf8"));
  const norm = normalizeIr(ir);
  const s = stableStringify(norm);
  const h = crypto.createHash("sha256").update(s).digest("hex");
  process.stdout.write(h);
}

main();
