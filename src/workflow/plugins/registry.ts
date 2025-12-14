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

  /**
   * 返回 catalog，用于前端渲染与 schema 校验。
   * 兼容性保证：
   *  - 每个条目都有 type + version（number） + typeVersion（number）
   *  - meta 始终为对象（{}）而不是 null
   */
  catalog() {
    const items: any[] = [];
    for (const p of this.map.values()) {
      const ver = Number(p.version ?? 1);
      items.push({
        // 与 step-registry.v1 schema 对齐
        type: p.type,
        // /兼容现有消费者（tests/前端）期待的字段名
        version: ver,
        // 同时保留 typeVersion（过去/未来可能使用）
        typeVersion: ver,
        // meta 应当始终是对象（避免 null 引起 schema 校验失败）
        meta: p.meta ?? {},
        // 保留 impl 或其它字段供前端/校验使用（如果插件提供）
        impl: (p as any).impl ?? undefined
      });
    }

    // 稳定排序，避免前端 diff 抖动
    items.sort((a, b) => `${a.type}@${a.version}`.localeCompare(`${b.type}@${b.version}`));
    return items;
  }
}
