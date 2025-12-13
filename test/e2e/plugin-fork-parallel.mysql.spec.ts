import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("plugin DAG: flow.fork real parallel (mysql)", () => {
  let pool: mysql.Pool;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EWF_MYSQL_URL = mysqlUrl!;
    execSync(`node tools/mysql-init.js`, { stdio: "inherit", env: process.env as any });
    pool = mysql.createPool(mysqlUrl!);

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.listen(0);

    const url = await app.getUrl();
    await request(app.getHttpServer())
      .put(`/internal/connectors/conn_http/config`)
      .send({ baseUrl: url, timeoutMs: 3000 })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  test("two delay branches should complete near single delay time", async () => {
    const wfId = `wf_fork_parallel_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${wfId}/run`;

    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      compiler: "plugin",
      id: wfId,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: ["conn_http"] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath }],
      graph: {
        start: { nodeId: "n_fork", port: "in" },
        nodes: [
          { id: "n_fork", type: "flow.fork", typeVersion: 1, inputs: { mergeNodeId: { const: "n_merge" } } },

          {
            id: "n_b1",
            type: "conn.call",
            typeVersion: 1,
            inputs: {
              connectorId: { const: "conn_http" },
              operationId: { const: "request" },
              body: { const: { method: "POST", path: "/internal/mock/upstream/delay", body: { ms: 250 } } },
            },
          },
          {
            id: "n_b2",
            type: "conn.call",
            typeVersion: 1,
            inputs: {
              connectorId: { const: "conn_http" },
              operationId: { const: "request" },
              body: { const: { method: "POST", path: "/internal/mock/upstream/delay", body: { ms: 250 } } },
            },
          },

          { id: "n_merge", type: "flow.merge", typeVersion: 1 },

          {
            id: "n_ret",
            type: "flow.return",
            typeVersion: 1,
            inputs: {
              value: {
                expr: {
                  lang: "jsonata",
                  body: `{
                    "b1": steps.n_b1.output.ms,
                    "b2": steps.n_b2.output.ms
                  }`,
                },
              },
            },
          },
        ],
        edges: [
          { from: { nodeId: "n_fork", port: "b1" }, to: { nodeId: "n_b1", port: "in" } },
          { from: { nodeId: "n_fork", port: "b2" }, to: { nodeId: "n_b2", port: "in" } },

          { from: { nodeId: "n_b1", port: "out" }, to: { nodeId: "n_merge", port: "in" } },
          { from: { nodeId: "n_b2", port: "out" }, to: { nodeId: "n_merge", port: "in" } },

          { from: { nodeId: "n_merge", port: "out" }, to: { nodeId: "n_ret", port: "in" } },
        ],
      },
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfId}/draft`).send(draft).expect(200);
    const pub = await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    await request(app.getHttpServer())
      .post(`/internal/workflows/${wfId}/activate`)
      .send({ version: pub.body.version })
      .expect(200);

    const t0 = Date.now();
    const r = await request(app.getHttpServer()).post(triggerPath).send({}).expect(200);
    const dt = Date.now() - t0;

    expect(r.body.status).toBe("SUCCEEDED");
    expect(r.body.output.b1).toBe(250);
    expect(r.body.output.b2).toBe(250);

    // 并行：应接近 250ms（给 Windows/CI 留余量）
    expect(dt).toBeLessThan(420);
  });
});
