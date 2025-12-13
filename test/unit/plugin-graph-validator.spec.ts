import { validatePluginGraph } from "../../src/workflow/plugin-graph.validator";
import { createBuiltinRegistry } from "../../src/workflow/plugins/builtin";
import { registerCustomPlugins } from "../../src/workflow/plugins/custom";

describe("plugin graph validator", () => {
  const reg = registerCustomPlugins(createBuiltinRegistry());

  test("fork branches must not intersect before merge", () => {
    const graph: any = {
      start: { nodeId: "fork", port: "in" },
      nodes: [
        { id: "fork", type: "flow.fork", typeVersion: 1, inputs: { mergeNodeId: { const: "m" } } },
        { id: "x", type: "flow.merge", typeVersion: 1 },
        { id: "m", type: "flow.merge", typeVersion: 1 },
      ],
      edges: [
        { from: { nodeId: "fork", port: "b1" }, to: { nodeId: "x", port: "in" } },
        { from: { nodeId: "fork", port: "b2" }, to: { nodeId: "x", port: "in" } }, // 两分支立刻交叉在 x
        { from: { nodeId: "x", port: "out" }, to: { nodeId: "m", port: "in" } },
      ],
    };

    expect(() => validatePluginGraph(graph, reg)).toThrow(/PLUGIN_GRAPH_FORK_BRANCH_INTERSECT/);
  });

  test("if branch must reach merge", () => {
    const graph: any = {
      start: { nodeId: "if1", port: "in" },
      nodes: [
        { id: "if1", type: "flow.if", typeVersion: 1, inputs: { cond: { const: true }, mergeNodeId: { const: "m" } } },
        { id: "t", type: "flow.merge", typeVersion: 1 },
        { id: "f", type: "flow.merge", typeVersion: 1 },
        { id: "m", type: "flow.merge", typeVersion: 1 },
      ],
      edges: [
        { from: { nodeId: "if1", port: "true" }, to: { nodeId: "t", port: "in" } },
        { from: { nodeId: "if1", port: "false" }, to: { nodeId: "f", port: "in" } },
        // true/false 都没有到 m
      ],
    };

    expect(() => validatePluginGraph(graph, reg)).toThrow(/PLUGIN_GRAPH_IF_BRANCH_NOT_REACH_MERGE/);
  });
});
