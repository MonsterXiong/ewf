const fs = require("fs");
const path = require("path");
const { scripts } = require("./compiler-scripts");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, obj) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); }

function labelNode(id){ return `L_NODE_${id}`; }
function labelBranchStart(parId, name){ return `L_B_${parId}_${name}`; }
function labelBranchEnd(parId, name){ return `L_B_${parId}_${name}_END`; }
function labelRouterElse(nodeId, idx){ return `L_ROUTER_${nodeId}_ELSE_${idx}`; }

function buildIndex(wf) {
  const nodes = wf.graph.nodes ?? [];
  const edges = wf.graph.edges ?? [];
  const nodeById = new Map(nodes.map((n)=>[n.id,n]));
  const outEdges = new Map();
  const inDegree = new Map();

  for (const e of edges) {
    const k = `${e.from.nodeId}:${e.from.port}`;
    if (!outEdges.has(k)) outEdges.set(k, []);
    outEdges.get(k).push(e.to.nodeId);
    inDegree.set(e.to.nodeId, (inDegree.get(e.to.nodeId) ?? 0) + 1);
  }
  const startNodeId = wf.graph.start?.nodeId;
  if (!startNodeId) throw new Error("missing graph.start.nodeId");
  return { nodeById, outEdges, inDegree, startNodeId };
}

function getSingleSucc(outEdges, nodeId, port="out"){
  const arr = outEdges.get(`${nodeId}:${port}`) ?? [];
  if (arr.length === 0) return null;
  if (arr.length > 1) throw new Error(`only supports single successor on ${nodeId}:${port} in MVP`);
  return arr[0];
}

function loadRegistry(regPath){
  const reg = readJson(regPath);
  const map = new Map();
  for (const n of reg.nodes ?? []) {
    map.set(`${n.type}@${n.typeVersion}`, n);
  }
  return map;
}

function compileAuthoringToIr(wf, regMap) {
  const { nodeById, outEdges, inDegree, startNodeId } = buildIndex(wf);

  const ir = {
    kind:"ewf.ir",
    irVersion:"1.0",
    workflowId: wf.id,
    workflowVersion: wf.version ?? 1,
    triggers: wf.triggers ?? [],
    policies: wf.policies ?? {},
    contracts: wf.contracts ?? {},
    compiledAt: new Date().toISOString(),
    program:[]
  };
  const program = ir.program;
  const compiled = new Set();

  const emit = (x)=>program.push(x);

  function getEntry(node){
    const key = `${node.type}@${node.typeVersion ?? 1}`;
    const entry = regMap.get(key);
    if (!entry) throw new Error(`registry entry not found: ${key}`);
    return entry;
  }

  function compileSequential(node){
    const entry = getEntry(node);
    if (entry.compile.kind === "ir.emit") {
      if (entry.compile.emitOp === "CALL") {
        // normalize CALL
        emit({
          op:"CALL",
          id: node.id,
          spec: {
            type: "connector.call",
            connectorId: node.inputs?.["spec.connectorId"]?.const,
            operationId: node.inputs?.["spec.operationId"]?.const
          },
          inputs: (node.inputs?.inputs?.const ?? node.inputs?.inputs) ?? {},
          retry: node.config?.retry ?? node.inputs?.retry ?? undefined,
          onError: node.config?.onError ?? node.inputs?.onError ?? undefined
        });
      } else if (entry.compile.emitOp === "WAIT") {
        emit({ op:"WAIT", id: node.id, eventKey: node.inputs?.eventKey, timeoutMs: node.inputs?.timeoutMs?.const ?? 0 });
      } else if (entry.compile.emitOp === "RETURN") {
        emit({ op:"RETURN", id: node.id, output: node.inputs?.value });
      } else {
        throw new Error(`unsupported emitOp ${entry.compile.emitOp}`);
      }
      return;
    }

    if (entry.compile.kind === "ir.script") {
      const fn = scripts[entry.compile.scriptId];
      if (!fn) throw new Error(`missing script: ${entry.compile.scriptId}`);
      const out = fn(node);
      if (Array.isArray(out)) for (const ins of out) emit(ins);
      else throw new Error(`script for sequential node must return ins[] (node=${node.id})`);
      return;
    }

    throw new Error(`unsupported compile kind: ${entry.compile.kind}`);
  }

  function compileRouter(node){
    const entry = getEntry(node);
    const fn = scripts[entry.compile.scriptId];
    const out = fn(node);
    const cases = out.cases;
    for (let i=0;i<cases.length;i++){
      const c = cases[i];
      const isLast = i === cases.length - 1;
      if (!isLast) {
        emit({ op:"IF", cond: c.when, then: labelNode(c.to), else: labelRouterElse(node.id, i+1) });
        emit({ op:"LABEL", name: labelRouterElse(node.id, i+1) });
      } else {
        emit({ op:"JUMP", to: labelNode(c.to) });
      }
    }
    // compile targets
    for (const c of cases) compileNode(c.to);
  }

  function linearPath(start, stop){
    const path = [];
    let cur = start;
    const seen = new Set();
    while (cur && cur !== stop) {
      if (seen.has(cur)) throw new Error(`loop in branch path at ${cur}`);
      seen.add(cur);
      path.push(cur);
      const succ = getSingleSucc(outEdges, cur, "out");
      if (!succ) throw new Error(`branch node ${cur} has no out edge, expected reach join ${stop}`);
      cur = succ;
    }
    return path;
  }

  function inferJoin(branchStarts){
    const paths = branchStarts.map((s) => {
      const arr = [s];
      let cur = s;
      const seen = new Set([cur]);
      while (true) {
        const succ = getSingleSucc(outEdges, cur, "out");
        if (!succ) break;
        arr.push(succ);
        if (seen.has(succ)) break;
        seen.add(succ);
        if ((inDegree.get(succ) ?? 0) >= 2) break;
        cur = succ;
      }
      return arr;
    });

    const all = new Set(paths[0]);
    for (let i=1;i<paths.length;i++){
      for (const n of Array.from(all)) {
        if (!paths[i].includes(n)) all.delete(n);
      }
    }
    const cand = Array.from(all);
    if (!cand.length) throw new Error(`cannot infer join for branches: ${branchStarts.join(",")}`);

    let best = cand[0], bestScore = Infinity;
    for (const c of cand) {
      const score = paths.reduce((sum,p)=>sum+p.indexOf(c),0);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function compileParallelAll(node){
    const entry = getEntry(node);
    const fn = scripts[entry.compile.scriptId];
    const out = fn(node);
    const branches = out.branches;
    const starts = branches.map((b)=>b.to);
    const join = inferJoin(starts);

    emit({
      op:"FORK_ALL",
      id: node.id,
      mode: out.mode ?? "parallel",
      branches: branches.map((b)=>({
        name: b.name,
        from: labelBranchStart(node.id, b.name),
        to: labelBranchEnd(node.id, b.name)
      })),
      join: labelNode(join)
    });

    for (const b of branches) {
      emit({ op:"LABEL", name: labelBranchStart(node.id, b.name) });

      const chain = linearPath(b.to, join);
      for (const nid of chain) {
        const n = nodeById.get(nid);
        const e = getEntry(n);
        if (e.flowKind === "router" || e.flowKind === "parallelAll") throw new Error(`MVP forbids router/parallel inside fork branch (node=${nid})`);
        if (n.type === "flow.awaitEvent" || n.type === "flow.return") throw new Error(`MVP forbids WAIT/RETURN inside fork branch (node=${nid})`);

        // emit ins for this branch node (no LABEL/JUMP)
        if (e.flowKind === "sequential") compileSequential(n);
        compiled.add(nid); // avoid duplicate compile by main path
      }

      emit({ op:"LABEL", name: labelBranchEnd(node.id, b.name) });
    }

    compileNode(join);
  }

  function compileNode(nodeId){
    if (compiled.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) throw new Error(`node not found: ${nodeId}`);
    compiled.add(nodeId);

    emit({ op:"LABEL", name: labelNode(nodeId) });

    const entry = getEntry(node);
    if (entry.flowKind === "router") {
      compileRouter(node);
      return;
    }
    if (entry.flowKind === "parallelAll") {
      compileParallelAll(node);
      return;
    }
    if (entry.flowKind === "terminal") {
      compileSequential(node);
      return;
    }

    // sequential
    compileSequential(node);
    const succ = getSingleSucc(outEdges, nodeId, "out");
    if (!succ) throw new Error(`node ${nodeId} missing out edge; terminal must be flow.return`);
    emit({ op:"JUMP", to: labelNode(succ) });
    compileNode(succ);
  }

  compileNode(startNodeId);
  return ir;
}

function main(){
  const args = process.argv.slice(2);
  const inPath = argVal(args, "--in");
  const outPath = argVal(args, "--out");
  const regPath = argVal(args, "--registry") || "registries/builtin.registry.json";
  if (!inPath || !outPath) {
    console.log("usage: node tools/compile-authoring.js --in workflows/x.workflow.json --out workflows/x.ir.json [--registry registries/builtin.registry.json]");
    process.exit(1);
  }
  const wf = readJson(inPath);
  const regMap = loadRegistry(path.resolve(regPath));
  const ir = compileAuthoringToIr(wf, regMap);
  writeJson(outPath, ir);
  console.log("compiled IR:", outPath);
}
function argVal(args, name){
  const i = args.indexOf(name);
  if (i < 0) return null;
  return args[i+1] || null;
}
main();
