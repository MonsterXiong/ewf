import { Injectable } from "@nestjs/common";
import { createBuiltinRegistry } from "./plugins/builtin";
import { registerCustomPlugins } from "./plugins/custom";
import { NodeRegistry } from "./plugins/registry";
import { AuthoringGraph, AuthoringNode, InputHint } from "./plugins/types";

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

@Injectable()
export class DraftDefaultsService {
  private registry: NodeRegistry;

  constructor() {
    this.registry = registerCustomPlugins(createBuiltinRegistry());
  }

  applyDefaults(draft: any) {
    const out = deepClone(draft);
    const graph: AuthoringGraph | undefined = out?.graph;
    if (!graph?.nodes) return out;

    for (const node of graph.nodes as AuthoringNode[]) {
      const plugin = this.registry.mustGet(node.type, node.typeVersion);
      const hints: InputHint[] = plugin?.meta?.inputs ?? [];
      if (hints.length === 0) continue;

      if (!node.inputs) node.inputs = {};

      for (const h of hints) {
        const cur = (node.inputs as any)[h.name];
        if (cur != null) continue;

        // defaultValue 推荐是 ValueExpr 或者直接值；这里都支持
        if (h.defaultValue != null) {
          (node.inputs as any)[h.name] = deepClone(h.defaultValue);
        }
      }
    }

    return out;
  }
}
