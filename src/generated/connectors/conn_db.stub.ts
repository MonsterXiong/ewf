type Resp<T> = { status: number; headers: Record<string,string>; body: T };

export class ConnDbClient {
  private db: Record<string, Record<string, any>> = {
    t_customer: {
      c001: { id:"c001", name:"Alice", level:"vip", email:"alice@example.com" },
      c002: { id:"c002", name:"Bob", level:"normal", email:"bob@example.com" }
    }
  };

  async SelectById(req: { body: { table: string; idField: string; id: string } }): Promise<Resp<any>> {
    const { table, id } = req.body;
    const row = (this.db[table] ?? {})[id] ?? null;
    return { status: 200, headers: {}, body: row };
  }

  async SelectPage(req: { body: { table: string; page: number; pageSize: number; filters?: any } }): Promise<Resp<any>> {
    const { table, page=1, pageSize=10, filters={} } = req.body;
    let rows = Object.values(this.db[table] ?? {}).filter((r:any)=>!r?.deletedAt);
    for (const [k,v] of Object.entries(filters)) rows = rows.filter((r:any)=>r?.[k]===v);
    const total = rows.length;
    const start = (page-1)*pageSize;
    const items = rows.slice(start, start+pageSize);
    return { status: 200, headers: {}, body: { page, pageSize, total, items } };
  }

  // ✅ 新增：export 使用
  async SelectAll(req: { body: { table: string } }): Promise<Resp<{ items: any[] }>> {
    const { table } = req.body;
    const items = Object.values(this.db[table] ?? {}).filter((r:any)=>!r?.deletedAt);
    return { status: 200, headers: {}, body: { items } };
  }

  async Insert(req: { body: { table: string; row: any } }): Promise<Resp<any>> {
    const { table, row } = req.body;
    if (!row?.id) throw Object.assign(new Error("missing row.id"), { kind:"ConnectorError", status:400 });
    this.db[table] = this.db[table] ?? {};
    this.db[table][row.id] = row;
    return { status: 201, headers: {}, body: row };
  }

  async UpdateById(req: { body: { table: string; idField: string; id: string; patch: any } }): Promise<Resp<any>> {
    const { table, id, patch } = req.body;
    const cur = this.db[table]?.[id];
    if (!cur) throw Object.assign(new Error("not found"), { kind:"ConnectorError", status:404 });
    const next = { ...cur, ...(patch ?? {}) };
    this.db[table][id] = next;
    return { status: 200, headers: {}, body: next };
  }

  async SoftDeleteById(req: { body: { table: string; idField: string; id: string } }): Promise<Resp<any>> {
    const { table, id } = req.body;
    const cur = this.db[table]?.[id];
    if (!cur) throw Object.assign(new Error("not found"), { kind:"ConnectorError", status:404 });
    this.db[table][id] = { ...cur, deletedAt: new Date().toISOString() };
    return { status: 200, headers: {}, body: { ok: true, id } };
  }

  // ✅ 新增：import 使用（无 loop 一次性 upsert）
  async UpsertMany(req: { body: { table: string; idField: string; rows: any[] } }): Promise<Resp<any>> {
    const { table, rows } = req.body;
    if (!Array.isArray(rows)) throw Object.assign(new Error("rows must be array"), { kind:"ConnectorError", status:400 });

    this.db[table] = this.db[table] ?? {};
    let inserted = 0, updated = 0;

    for (const row of rows) {
      if (!row?.id) continue;
      if (this.db[table][row.id]) {
        this.db[table][row.id] = { ...this.db[table][row.id], ...row };
        updated++;
      } else {
        this.db[table][row.id] = row;
        inserted++;
      }
    }

    return { status: 200, headers: {}, body: { ok: true, inserted, updated, total: inserted + updated } };
  }
}
