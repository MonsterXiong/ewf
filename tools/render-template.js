const fs = require("fs");
const path = require("path");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, obj) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); }

function getByPath(obj, p) {
  const parts = p.split(".").filter(Boolean);
  let cur = obj;
  for (const k of parts) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}
function applyMustache(value, params) {
  if (typeof value === "string") {
    return value.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, key) => {
      const v = getByPath(params, key);
      return v == null ? "" : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((x) => applyMustache(x, params));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyMustache(v, params);
    return out;
  }
  return value;
}

function main() {
  const args = process.argv.slice(2);
  const tplPath = argVal(args, "--tpl");
  const instPath = argVal(args, "--inst");
  const outPath = argVal(args, "--out");
  if (!tplPath || !instPath || !outPath) {
    console.log("usage: node tools/render-template.js --tpl templates/crud.template.json --inst instances/customer_crud.instance.json --out workflows/customer_crud.workflow.json");
    process.exit(1);
  }

  const tpl = readJson(tplPath);
  const inst = readJson(instPath);
  const params = inst.params ?? {};
  const entityLower = String(params.entity || "entity").toLowerCase();
  const workflowId = params.workflowId || `wf_${entityLower}_crud`;


  const mergedParams = { ...params, entityLower, workflowId };

  let wf = JSON.parse(JSON.stringify(tpl.skeleton));
  wf = applyMustache(wf, mergedParams);

  // apply patches in template (optional)
  const patches = tpl.patches ?? [];
  if (patches.length) {
    const { applyPatches } = require("./patch-engine");
    applyPatches(wf, mergedParams, patches);
  }

  writeJson(outPath, wf);
  console.log("rendered workflow:", outPath);
}

function argVal(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  return args[i + 1] || null;
}

main();
