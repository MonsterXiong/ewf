import { createBuiltinRegistry } from "./plugins/builtin";
import { AuthoringGraph, CompileCtx, AuthoringNode } from "./plugins/types";

function indexGraph(graph: AuthoringGraph) {
  const nodeById = new Map<string, AuthoringNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  const nextMap = new Map<string, string>();
  const outCount = new Map<string, number>();

  for (const e of graph.edges || []) {
    const from = e.from.nodeId;
    const to = e.to.nodeId;
    outCount.set(from, (outCount.get(from) ?? 0) + 1);
    // MVP：仅允许每个节点单出口
    if (nextMap.has(from)) {
      throw new Error(`PLUGIN_COMPILER_MULTIPLE_OUT_EDGES node=${from}`);
    }
    nextMap.set(from, to);
  }

  return { nodeById, nextMap };
}

export function compileWithPlugins(draft: any) {
  const graph: AuthoringGraph = draft?.graph;
  if (!graph?.start?.nodeId) throw new Error("PLUGIN_COMPILER_GRAPH_INVALID");

  const reg = createBuiltinRegistry();
  const { nodeById, nextMap } = indexGraph(graph);
  const ctx: CompileCtx = { graph };

  // 从 start 沿 next 编译成线性 program
  const program: any[] = [];
  program.push({ op: "LABEL", name: "start" });

  const visited = new Set<string>();
  let cur = graph.start.nodeId;

  while (cur) {
    if (visited.has(cur)) throw new Error(`PLUGIN_COMPILER_CYCLE node=${cur}`);
    visited.add(cur);

    const node = nodeById.get(cur);
    if (!node) throw new Error(`PLUGIN_COMPILER_NODE_NOT_FOUND node=${cur}`);

    const plugin = reg.mustGet(node.type, node.typeVersion);
    plugin.validate?.(node);

    const ops = plugin.compile(node, ctx);
    for (const op of ops) program.push(op);

    // 线性流继续走
    cur = nextMap.get(cur) || "";
  }

  // 输出 IR（兼容你现有 runtime 结构）
  return {
    workflowId: draft.id,
    workflowVersion: Number(draft.version ?? 1),
    policies: draft.policies ?? { egress: { mode: "denyByDefault", allowConnectors: [] } },
    program,
  };
}
