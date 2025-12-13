import mysql from "mysql2/promise";

export class ConnectorConfigRepo {
  constructor(private readonly pool: mysql.Pool) {}

  async get(connectorId: string): Promise<any | null> {
    const [rows] = await this.pool.query(
      `SELECT config_json FROM connector_configs WHERE connector_id=? LIMIT 1`,
      [connectorId]
    );
    const arr = rows as any[];
    if (!arr.length) return null;
    const v = arr[0].config_json;
    return typeof v === "string" ? JSON.parse(v) : v;
  }

  async upsert(connectorId: string, config: any) {
    if (!config || typeof config !== "object") throw new Error("CONNECTOR_CONFIG_INVALID");
    await this.pool.execute(
      `INSERT INTO connector_configs (connector_id, config_json)
       VALUES (?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE config_json=VALUES(config_json)`,
      [connectorId, JSON.stringify(config)]
    );
    return { ok: true, connectorId };
  }
}
