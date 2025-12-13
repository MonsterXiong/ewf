import { NodeRegistry } from "./plugins/registry";
import { AuthoringGraph, AuthoringNode } from "./plugins/types";

type Edge = { from: { nodeId: string; port: string }; to: { nodeId: string; port: string } };

function uniqCheck(ids: string[]) {
  const s = new Set<string>();
  for (const id of ids) {
    if (s.has(id)) throw new Error(`PLUGIN_GRAPH_DUP_NODE_ID ${id}`);
    s.add(id);
  }
}

function mustNode(nodeById: Map<string, AuthoringNode>, id: string) {
  const n = nodeById.get(id);
  if (!n) throw new Error(`PLUGIN_GRAPH_NODE_NOT_FOUND ${id}`);
  return n;
}

function outEdgesOf(outEdges: Map<string, Edge[]>, nodeId: string) {
  return outEdges.get(nodeId) ?? [];
}

function buildAdj(outEdges: Map<string, Edge[]>) {
  const adj = new Map<string, string[]>();
  for (const [from, edges] of outEdges.entries()) {
    adj.set(from, edges.map(e => e.to.nodeId));
  }
  return adj;
}

function detectCycleFrom(start: string, adj: Map<string, string[]>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (u: string) => {
    if (visiting.has(u)) throw new Error(`PLUGIN_GRAPH_CYCLE ${u}`);
    if (visited.has(u)) return;
    visiting.add(u);
    for (const v of (adj.get(u) ?? [])) dfs(v);
    visiting.delete(u);
    visited.add(u);
  };

  dfs(start);
}

function reachableUntilStop(
  start: string,
  stop: string,
  adj: Map<string, string[]>
): { seen: Set<string>; reachesStop: boolean } {
  const seen = new Set<string>();
  const stack = [start];
  let reachesStop = false;

  while (stack.length) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    if (u === stop) {
      reachesStop = true;
      continue; // 不穿透 stop
    }
    for (const v of (adj.get(u) ?? [])) {
      if (!seen.has(v)) stack.push(v);
    }
  }
  return { seen, reachesStop };
}

/**
 * 结构化 DAG 约束：
 * - 非控制节点（除 flow.if/flow.fork）最多 1 条出边
 * - flow.if 必须有 true/false 两条出边；且 mergeNodeId 必须存在并且 type=flow.merge
 * - flow.fork 必须至少 2 条出边；且 mergeNodeId 必须存在并且 type=flow.merge
 * - 每个分支必须可达 merge；并且不同分支在到达 merge 前不能共享节点（只允许在 merge 汇合）
 * - 基本无环（从 start 可达范围内）
 */
export function validatePluginGraph(graph: AuthoringGraph, registry: NodeRegistry) {
  if (!graph?.start?.nodeId) throw new Error("PLUGIN_GRAPH_INVALID_START");

  uniqCheck((graph.nodes ?? []).map(n => n.id));

  const nodeById = new Map<string, AuthoringNode>();
  for (const n of graph.nodes ?? []) nodeById.set(n.id, n);

  const edges: Edge[] = (graph.edges ?? []) as any[];
  for (const e of edges) {
    if (!nodeById.has(e.from.nodeId)) throw new Error(`PLUGIN_GRAPH_EDGE_FROM_NOT_FOUND ${e.from.nodeId}`);
    if (!nodeById.has(e.to.nodeId)) throw new Error(`PLUGIN_GRAPH_EDGE_TO_NOT_FOUND ${e.to.nodeId}`);
  }

  // 插件必须存在（真正做到“新增节点=新增插件，不改引擎”）
  for (const n of graph.nodes ?? []) {
    registry.mustGet(n.type, n.typeVersion);
  }

  const outEdges = new Map<string, Edge[]>();
  const inDeg = new Map<string, number>();
  for (const e of edges) {
    outEdges.set(e.from.nodeId, [...(outEdges.get(e.from.nodeId) ?? []), e]);
    inDeg.set(e.to.nodeId, (inDeg.get(e.to.nodeId) ?? 0) + 1);
  }

  const adj = buildAdj(outEdges);
  detectCycleFrom(graph.start.nodeId, adj);

  const validateStructuredBranches = (controlId: string, branchStarts: string[], mergeId: string, kind: "IF" | "FORK") => {
    const mergeNode = mustNode(nodeById, mergeId);
    if (mergeNode.type !== "flow.merge") {
      throw new Error(`PLUGIN_GRAPH_${kind}_MERGE_NOT_FLOW_MERGE control=${controlId} merge=${mergeId} type=${mergeNode.type}`);
    }

    const sets: Set<string>[] = [];
    for (const b of branchStarts) {
      const r = reachableUntilStop(b, mergeId, adj);
      if (!r.reachesStop) {
        throw new Error(`PLUGIN_GRAPH_${kind}_BRANCH_NOT_REACH_MERGE control=${controlId} branch=${b} merge=${mergeId}`);
      }
      sets.push(r.seen);
    }

    // 分支之间不能共享节点（只允许 merge）
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        for (const x of sets[i]) {
          if (x === mergeId) continue;
          if (sets[j].has(x)) {
            throw new Error(`PLUGIN_GRAPH_${kind}_BRANCH_INTERSECT control=${controlId} node=${x}`);
          }
        }
      }
    }

    // merge 入度建议 >= 分支数（不是强制，但给出更清晰错误）
    const deg = inDeg.get(mergeId) ?? 0;
    if (deg < branchStarts.length) {
      throw new Error(`PLUGIN_GRAPH_${kind}_MERGE_INDEGREE_TOO_SMALL control=${controlId} merge=${mergeId} indeg=${deg} branches=${branchStarts.length}`);
    }
  };

  for (const n of graph.nodes ?? []) {
    const outs = outEdgesOf(outEdges, n.id);

    if (n.type === "flow.if") {
      const mergeId = (n.inputs as any)?.mergeNodeId?.const;
      if (!mergeId) throw new Error(`FLOW_IF_MERGE_REQUIRED node=${n.id}`);

      const t = outs.filter(e => e.from.port === "true");
      const f = outs.filter(e => e.from.port === "false");
      if (t.length !== 1) throw new Error(`FLOW_IF_PORT_REQUIRED node=${n.id} port=true`);
      if (f.length !== 1) throw new Error(`FLOW_IF_PORT_REQUIRED node=${n.id} port=false`);

      validateStructuredBranches(n.id, [t[0].to.nodeId, f[0].to.nodeId], mergeId, "IF");
      continue;
    }

    if (n.type === "flow.fork") {
      const mergeId = (n.inputs as any)?.mergeNodeId?.const;
      if (!mergeId) throw new Error(`FLOW_FORK_MERGE_REQUIRED node=${n.id}`);

      if (outs.length < 2) throw new Error(`FLOW_FORK_BRANCHES_REQUIRED node=${n.id}`);

      // 分支 port 唯一
      const ports = outs.map(e => String(e.from.port));
      const s = new Set(ports);
      if (s.size !== ports.length) throw new Error(`FLOW_FORK_DUP_BRANCH_PORT node=${n.id}`);

      validateStructuredBranches(n.id, outs.map(e => e.to.nodeId), mergeId, "FORK");
      continue;
    }

    // 普通节点（以及 flow.merge）最多 1 条出边
    if (outs.length > 1) throw new Error(`PLUGIN_GRAPH_MULTIPLE_OUT_EDGES node=${n.id} type=${n.type}`);
  }
}
