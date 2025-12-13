import { NodePlugin } from "../types";

export const FlowAwaitEventV1: NodePlugin = {
  type: "flow.awaitEvent",
  version: 1,
  meta: {
    title: "Await Event",
    description: "等待外部事件唤醒（异步）",
    ports: { in: ["in"], out: ["out"] },
    inputs: [
      {
        name: "eventKey",
        title: "事件 Key",
        kind: "string",
        required: true,
        description: "等待 /internal/events/emit 的 eventKey（支持 expr/ref）",
        examples: [{ expr: { lang: "jsonata", body: "'ev:' & vars.id" } }],
      },
      {
        name: "timeoutMs",
        title: "超时毫秒",
        kind: "number",
        required: false,
        defaultValue: { const: 0 },
        min: 0,
        description: "0 表示不超时（按当前引擎语义）",
      },
    ],
  },
  validate(node) {
    if (!node.inputs?.eventKey) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.eventKey`);
  },
  compile(node) {
    return [
      {
        op: "WAIT",
        id: node.id,
        eventKey: node.inputs!.eventKey,
        timeoutMs: node.inputs?.timeoutMs ?? { const: 0 },
      },
    ];
  },
};
