import { NodePlugin } from "./types";

export class NodeRegistry {
  private map = new Map<string, NodePlugin>();

  register(p: NodePlugin) {
    const k = `${p.type}@${p.version}`;
    if (this.map.has(k)) throw new Error(`NODE_PLUGIN_DUPLICATE ${k}`);
    this.map.set(k, p);
    return this;
  }

  get(type: string, version: number): NodePlugin | undefined {
    return this.map.get(`${type}@${version}`);
  }

  mustGet(type: string, version: number): NodePlugin {
    const p = this.get(type, version);
    if (!p) throw new Error(`NODE_PLUGIN_NOT_FOUND ${type}@${version}`);
    return p;
  }

  catalog() {
    const items: any[] = [];
    for (const p of this.map.values()) {
      items.push({
        type: p.type,
        version: p.version,
        meta: p.meta ?? null,
      });
    }
    // 稳定排序，避免前端 diff 抖动
    items.sort((a, b) => `${a.type}@${a.version}`.localeCompare(`${b.type}@${b.version}`));
    return items;
  }
}
