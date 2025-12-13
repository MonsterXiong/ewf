export type ValueExpr =
  | { const: any }
  | { ref: string }
  | { expr: { lang: "jsonata"; body: string } };

export type AuthoringNode = {
  id: string;
  type: string;
  typeVersion: number;
  inputs?: Record<string, ValueExpr>;
};

export type AuthoringEdge = {
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
};

export type AuthoringGraph = {
  start: { nodeId: string; port: string };
  nodes: AuthoringNode[];
  edges: AuthoringEdge[];
};

export type CompileCtx = {
  graph: AuthoringGraph;
};

export type IrOp = any;

// ====== UI / Catalog meta ======

export type InputHint = {
  name: string;
  title?: string;
  description?: string;

  // 前端渲染建议：常见类型
  kind: "string" | "number" | "boolean" | "json" | "expr";

  // 是否必须
  required?: boolean;

  // 是否只允许 const（例如 connectorId/operationId）
  constOnly?: boolean;

  // 默认值（用于 UI 初始化；建议是 ValueExpr，如 {const:"x"} 或 {const:{}}）
  defaultValue?: any;

  // 示例
  examples?: any[];

  // ===== 校验规则（当输入是 const 时可静态校验；ref/expr 暂不做强校验）=====
  enum?: any[];
  pattern?: string;     // string regex
  min?: number;         // number min
  max?: number;         // number max
};

export type NodeMeta = {
  title: string;
  description?: string;
  icon?: string;

  ports?: {
    in?: string[];
    out?: string[];
  };

  inputs?: InputHint[];

  outputs?: {
    description?: string;
    shape?: any;
  };
};

export interface NodePlugin {
  type: string;
  version: number;

  meta?: NodeMeta;

  validate?(node: AuthoringNode): void;
  compile(node: AuthoringNode, ctx: CompileCtx): IrOp[];
}
