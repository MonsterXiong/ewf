function isValue(x) {
  return x && typeof x === "object" && (("const" in x) || ("ref" in x) || ("expr" in x) || ("secretRef" in x));
}
function toValue(x) { return isValue(x) ? x : { const: x }; }
function jsonata(body) { return { expr: { lang: "jsonata", body } }; }

function transformV1(node) {
  const ins = [];
  const setVarsV = node.inputs?.setVars;
  const mergeV = node.inputs?.merge;
  const appendV = node.inputs?.append;
  const outV = node.inputs?.output;

  if (isValue(setVarsV) && setVarsV.const && typeof setVarsV.const === "object") {
    const set = {};
    for (const [k, v] of Object.entries(setVarsV.const)) {
      const key = String(k).startsWith("vars.") ? String(k) : `vars.${k}`;
      set[key] = toValue(v);
    }
    ins.push({ op: "SET_VARS", set, id: node.id });
    return ins;
  }

  if (isValue(mergeV) && mergeV.const && typeof mergeV.const === "object") {
    const { into, value } = mergeV.const;
    ins.push({ op: "MERGE", id: node.id, into, value: toValue(value) });
    return ins;
  }

  if (isValue(appendV) && appendV.const && typeof appendV.const === "object") {
    const { to, value } = appendV.const;
    ins.push({ op: "APPEND", id: node.id, to, value: toValue(value) });
    return ins;
  }

  if (isValue(outV)) {
    ins.push({ op: "EVAL", id: node.id, output: toValue(outV) });
    return ins;
  }

  throw new Error(`transform.v1: unsupported node inputs (node=${node.id})`);
}

function slotV1(_node) {
  // slot 是可二开点，默认 no-op
  return [{ op: "EVAL", id: _node.id, output: { const: null } }];
}

function routerV1(node) {
  const casesV = node.inputs?.cases;
  const cases = (casesV && casesV.const) || [];
  if (!Array.isArray(cases) || cases.length < 2) throw new Error(`router.v1 requires cases.const[] >=2 (node=${node.id})`);
  return { cases: cases.map((c) => ({ when: toValue(c.when), to: c.to })) };
}

function parallelAllV1(node) {
  const branchesV = node.inputs?.branches;
  const branches = (branchesV && branchesV.const) || [];
  if (!Array.isArray(branches) || branches.length < 2) throw new Error(`parallelAll.v1 requires branches.const[] >=2 (node=${node.id})`);
  return { mode: "parallel", branches: branches.map((b) => ({ name: b.name, to: b.to })) };
}

function branchOutputV1(node) {
  const nameV = node.inputs?.name;
  const valV = node.inputs?.value;
  const name = (nameV && nameV.const) || nameV;
  if (typeof name !== "string" || !name) throw new Error(`branchOutput.v1 requires inputs.name string (node=${node.id})`);
  if (!isValue(valV)) throw new Error(`branchOutput.v1 requires inputs.value Value (node=${node.id})`);
  return [{ op: "MERGE", id: node.id, into: `vars.__branch.${name}`, value: toValue(valV) }];
}

function joinMergeV1(node) {
  const branches = (node.inputs?.branches?.const) || [];
  const into = (node.inputs?.into?.const) || node.inputs?.into;
  const strategy = (node.inputs?.mergeStrategy?.const) || "setByKey";
  const cleanup = node.inputs?.cleanup?.const;
  const doCleanup = cleanup === undefined ? true : Boolean(cleanup);

  if (!Array.isArray(branches) || branches.length === 0) throw new Error(`joinMerge.v1 branches required (node=${node.id})`);
  if (typeof into !== "string" || !into.startsWith("vars.")) throw new Error(`joinMerge.v1 into must be vars.* (node=${node.id})`);

  const sorted = [...branches].sort();
  let valueExpr;

  if (strategy === "setByKey") {
    const pairs = sorted.map((b) => `'${b}': vars.__branch.${b}`).join(", ");
    valueExpr = jsonata(`{ ${pairs} }`);
  } else if (strategy === "objectMerge") {
    const objs = sorted.map((b) => `vars.__branch.${b}`).join(", ");
    valueExpr = jsonata(`$merge([${objs}])`);
  } else if (strategy === "arrayPush") {
    const arr = sorted.map((b) => `vars.__branch.${b}`).join(", ");
    valueExpr = jsonata(`[ ${arr} ]`);
  } else {
    throw new Error(`joinMerge.v1 unsupported strategy=${strategy} (node=${node.id})`);
  }

  const ins = [{ op: "MERGE", id: node.id, into, value: toValue(valueExpr) }];
  if (doCleanup) ins.push({ op: "SET_VARS", id: node.id + "_cleanup", set: { "vars.__branch": { const: {} } } });
  return ins;
}

module.exports = {
  scripts: {
    "builtin.transform.v1": transformV1,
    "builtin.slot.v1": slotV1,
    "builtin.router.v1": routerV1,
    "builtin.parallelAll.v1": parallelAllV1,
    "builtin.branchOutput.v1": branchOutputV1,
    "builtin.joinMerge.v1": joinMergeV1
  }
};
