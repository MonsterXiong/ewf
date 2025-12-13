import { NodePlugin, ValueExpr } from "../types";

function mustConst(v: ValueExpr | undefined, field: string): any {
  if (v && typeof v === "object" && "const" in v) return (v as any).const;
  throw new Error(`NODE_INPUT_MUST_CONST ${field}`);
}

export const FlowIfV1: NodePlugin = {
  type: "flow.if",
  version: 1,
  meta: {
    title: "If",
    description: "条件分支（必须显式指定 mergeNodeId）",
    ports: { in: ["in"], out: ["true", "false"] },
    inputs: [
      { name: "cond", title: "条件", kind: "expr", required: true, description: "支持 const/ref/expr(jsonata)" },
      { name: "mergeNodeId", title: "合流节点ID", kind: "string", required: true, constOnly: true },
    ],
  },
  validate(node) {
    if (!node.inputs?.cond) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.cond`);
    if (!node.inputs?.mergeNodeId) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.mergeNodeId`);
    mustConst(node.inputs.mergeNodeId, `${node.id}.inputs.mergeNodeId`);
  },
  compile() {
    return []; // 控制流由 compiler 负责发 IF/JUMP
  },
};
