import { NodePlugin } from "../types";

export const FlowReturnV1: NodePlugin = {
  type: "flow.return",
  version: 1,
  meta: {
    title: "Return",
    description: "结束流程并返回结果",
    ports: { in: ["in"], out: [] },
    inputs: [
      {
        name: "value",
        title: "返回值",
        kind: "json",
        required: true,
        description: "支持 const/ref/expr(jsonata)",
        examples: [{ const: { ok: true } }, { ref: "steps.some.output" }],
      },
    ],
  },
  validate(node) {
    if (!node.inputs?.value) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.value`);
  },
  compile(node) {
    return [{ op: "RETURN", output: node.inputs!.value }];
  },
};
