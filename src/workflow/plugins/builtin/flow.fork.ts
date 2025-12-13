import { NodePlugin, ValueExpr } from "../types";

function mustConst(v: ValueExpr | undefined, field: string): any {
  if (v && typeof v === "object" && "const" in v) return (v as any).const;
  throw new Error(`NODE_INPUT_MUST_CONST ${field}`);
}

export const FlowForkV1: NodePlugin = {
  type: "flow.fork",
  version: 1,
  meta: {
    title: "Fork",
    description: "并行分支（MVP：按分支顺序执行，语义并行；必须显式 mergeNodeId）",
    ports: { in: ["in"], out: ["b1", "b2"] }, // UI 上可扩展更多分支
    inputs: [{ name: "mergeNodeId", title: "合流节点ID", kind: "string", required: true, constOnly: true }],
  },
  validate(node) {
    if (!node.inputs?.mergeNodeId) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.mergeNodeId`);
    mustConst(node.inputs.mergeNodeId, `${node.id}.inputs.mergeNodeId`);
  },
  compile() {
    return []; // 控制流由 compiler 负责发 JUMP 串行执行各分支
  },
};
