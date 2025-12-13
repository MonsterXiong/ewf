import { NodePlugin } from "../types";

export const FlowMergeV1: NodePlugin = {
  type: "flow.merge",
  version: 1,
  meta: {
    title: "Merge",
    description: "结构化合流节点（no-op，用于 if/fork 的 merge 锚点）",
    ports: { in: ["in"], out: ["out"] },
  },
  compile() {
    return []; // no-op
  },
};
