import { NodePlugin, ValueExpr } from "../types";

function mustConst(v: ValueExpr | undefined, field: string): any {
  if (v && typeof v === "object" && "const" in v) return (v as any).const;
  throw new Error(`NODE_INPUT_MUST_CONST ${field}`);
}

export const ConnCallV1: NodePlugin = {
  type: "conn.call",
  version: 1,
  meta: {
    title: "Connector Call",
    description: "统一的 connector 调用节点（HTTP/DB/内部服务…）",
    ports: { in: ["in"], out: ["out"] },
    inputs: [
      {
        name: "connectorId",
        title: "Connector Id",
        kind: "string",
        required: true,
        constOnly: true,
        pattern: "^[a-z0-9_]+$",
        description: "MVP：必须 const，便于权限/出口策略静态校验",
        examples: [{ const: "conn_http" }],
      },
      {
        name: "operationId",
        title: "Operation Id",
        kind: "string",
        required: true,
        constOnly: true,
        pattern: "^[a-zA-Z0-9_]+$",
        description: "MVP：必须 const",
        examples: [{ const: "request" }],
      },
      {
        name: "body",
        title: "请求体",
        kind: "json",
        required: true,
        defaultValue: { const: {} },
        description: "传给 connector 的 body（支持 const/ref/expr）",
      },
    ],
    outputs: { description: "connector 返回值（可被 steps.<id>.output 引用）" },
  },

  validate(node) {
    if (!node.inputs?.connectorId) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.connectorId`);
    if (!node.inputs?.operationId) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.operationId`);
    if (!node.inputs?.body) throw new Error(`NODE_INPUT_REQUIRED ${node.id} inputs.body`);

    mustConst(node.inputs.connectorId, `${node.id}.inputs.connectorId`);
    mustConst(node.inputs.operationId, `${node.id}.inputs.operationId`);
  },

  compile(node) {
    const connectorId = mustConst(node.inputs!.connectorId, `${node.id}.inputs.connectorId`);
    const operationId = mustConst(node.inputs!.operationId, `${node.id}.inputs.operationId`);

    return [
      {
        op: "CALL",
        id: node.id,
        spec: { connectorId, operationId },
        inputs: { body: node.inputs!.body },
      },
    ];
  },
};
