import { Injectable } from "@nestjs/common";
import { NodeRegistry } from "./plugins/registry";
import { createBuiltinRegistry } from "./plugins/builtin";
import { registerCustomPlugins } from "./plugins/custom";
import { AuthoringGraph, CompileCtx, AuthoringNode } from "./plugins/types";
import { validatePluginGraph } from "./plugin-graph.validator";

type Edge = { from: { nodeId: string; port: string }; to: { nodeId: string; port: string } };

function labelOf(nodeId: string) {
  return `n:${nodeId}`;
}
function forkEndLabel(forkId: string, branchName: string) {
  return `end:fork:${forkId}:${branchName}`;
}
function mustSingle<T>(arr: T[], err: string): T {
  if (arr.length !== 1) throw new Error(err);
  return arr[0];
}

@Injectable()
export class PluginCompilerService {
  private registry: NodeRegistry;

  constructor() {
    this.registry = registerCustomPlugins(createBuiltinRegistry());
  }

  catalog() {
    return this.registry.catalog();
  }

  compile(draft: any) {
    const graph: AuthoringGraph = draft?.graph;
    if (!graph?.start?.nodeId) throw new Error("PLUGIN_COMPILER_GRAPH_INVALID");

    // ✅ 编译前先做结构化 DAG 校验（企业级：错误清晰、稳定）
    validatePluginGraph(graph, this.registry);

    const nodeById = new Map<string, AuthoringNode>();
    for (const n of graph.nodes) nodeById.set(n.id, n);

    const outEdges = new Map<string, Edge[]>();
    for (const e of (graph.edges ?? []) as any[]) {
      const from = e.from.nodeId;
      outEdges.set(from, [...(outEdges.get(from) ?? []), e]);
    }

    const ctx: CompileCtx = { graph };
    const program: any[] = [{ op: "LABEL", name: "start" }];

    const compiling = new Set<string>();

    const compileSeq = (startId: string, stopId?: string) => {
      let cur = startId;

      while (cur && cur !== stopId) {
        if (compiling.has(cur)) throw new Error(`PLUGIN_COMPILER_CYCLE node=${cur}`);
        compiling.add(cur);

        const node = nodeById.get(cur);
        if (!node) throw new Error(`PLUGIN_COMPILER_NODE_NOT_FOUND node=${cur}`);

        const plugin = this.registry.mustGet(node.type, node.typeVersion);
        plugin.validate?.(node);

        program.push({ op: "LABEL", name: labelOf(cur) });

        // ===== flow.if =====
        if (node.type === "flow.if") {
          const edges = outEdges.get(cur) ?? [];
          const tEdge = edges.filter((x) => x.from.port === "true");
          const fEdge = edges.filter((x) => x.from.port === "false");

          const tNext = mustSingle(tEdge, `FLOW_IF_PORT_REQUIRED node=${cur} port=true`).to.nodeId;
          const fNext = mustSingle(fEdge, `FLOW_IF_PORT_REQUIRED node=${cur} port=false`).to.nodeId;

          const mergeNodeId = (node.inputs as any).mergeNodeId?.const;

          program.push({
            op: "IF",
            cond: (node.inputs as any).cond,
            then: labelOf(tNext),
            else: labelOf(fNext),
          });

          compileSeq(tNext, mergeNodeId);
          program.push({ op: "JUMP", to: labelOf(mergeNodeId) });

          compileSeq(fNext, mergeNodeId);
          program.push({ op: "JUMP", to: labelOf(mergeNodeId) });

          compiling.delete(node.id);
          cur = mergeNodeId;
          continue;
        }

        // ===== flow.fork -> FORK_ALL（真实并行）=====
        if (node.type === "flow.fork") {
          const forkId = node.id;
          const mergeNodeId = (node.inputs as any).mergeNodeId?.const;

          const edges = (outEdges.get(cur) ?? []).slice();
          edges.sort((a, b) => String(a.from.port).localeCompare(String(b.from.port)));

          const branches = edges.map((e) => {
            const name = String(e.from.port);
            return {
              name,
              from: labelOf(e.to.nodeId),
              to: forkEndLabel(forkId, name),
            };
          });

          program.push({
            op: "FORK_ALL",
            id: forkId,
            branches,
            join: labelOf(mergeNodeId),
          });

          for (const b of branches) {
            const startNodeId = String(b.from).replace(/^n:/, "");
            compileSeq(startNodeId, mergeNodeId);
            program.push({ op: "LABEL", name: String(b.to) });
          }

          compiling.delete(node.id);
          cur = mergeNodeId;
          continue;
        }

        // ===== flow.merge =====
        if (node.type === "flow.merge") {
          // no-op
        } else {
          const ops = plugin.compile(node, ctx);
          for (const op of ops) program.push(op);
        }

        const outs = outEdges.get(cur) ?? [];
        if (outs.length === 0) {
          compiling.delete(node.id);
          cur = "";
        } else {
          compiling.delete(node.id);
          cur = outs[0].to.nodeId;
        }
      }
    };

    compileSeq(graph.start.nodeId);

    return {
      workflowId: draft.id,
      workflowVersion: Number(draft.version ?? 1),
      policies: draft.policies ?? { egress: { mode: "denyByDefault", allowConnectors: [] } },
      program,
    };
  }
}
