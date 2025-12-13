import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("authoring(plugin) -> conn.call -> conn_http (mysql)", () => {
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

  test("draft(plugin DSL) -> publish -> activate -> trigger -> CALL conn_http -> return", async () => {
    const wfId = `wf_plugin_call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${wfId}/call-upstream`;

    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      compiler: "plugin",                // ✅ 关键：走 plugin compiler
      id: wfId,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: ["conn_http"] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath, input: { mapFrom: "body" } }],
      graph: {
        start: { nodeId: "n_call", port: "in" },
        nodes: [
          {
            id: "n_call",
            type: "conn.call",
            typeVersion: 1,
            inputs: {
              connectorId: { const: "conn_http" },
              operationId: { const: "request" },
              body: {
                expr: {
                  lang: "jsonata",
                  body: `{
                    "method": "POST",
                    "path": "/internal/mock/upstream/echo",
                    "body": {"x": vars.x}
                  }`,
                },
              },
            },
          },
          {
            id: "n_ret",
            type: "flow.return",
            typeVersion: 1,
            inputs: { value: { ref: "steps.n_call.output" } },
          },
        ],
        edges: [{ from: { nodeId: "n_call", port: "out" }, to: { nodeId: "n_ret", port: "in" } }],
      },
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfId}/draft`).send(draft).expect(200);
    const pub = await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    const version = pub.body?.version ?? 1;

    await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/activate`).send({ version }).expect(200);

    const r = await request(app.getHttpServer()).post(triggerPath).send({ x: 123 }).expect(200);
    expect(r.body.status).toBe("SUCCEEDED");
    expect(r.body.output.ok).toBe(true);
    expect(r.body.output.received.x).toBe(123);
  });
});
