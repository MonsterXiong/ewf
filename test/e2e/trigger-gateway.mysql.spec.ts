import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("trigger gateway (mysql)", () => {
  let pool: mysql.Pool;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EWF_MYSQL_URL = mysqlUrl!;
    execSync(`node tools/mysql-init.js`, { stdio: "inherit", env: process.env as any });
    pool = mysql.createPool(mysqlUrl!);

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  test("publish trigger then call /internal/api/*", async () => {
    const wfId = `wf_echo_gateway_demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${wfId}/echo2`;

    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: wfId,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: [] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath, input: { mapFrom: "body" } }],
      graph: {
        start: { nodeId: "n_return", port: "in" },
        nodes: [
          {
            id: "n_return",
            type: "flow.return",
            typeVersion: 1,
            inputs: { value: { expr: { lang: "jsonata", body: "{ 'ok': true, 'x': vars.x }" } } }
          }
        ],
        edges: []
      }
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfId}/draft`).send(draft).expect(200);
    const pub = await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    const version = pub.body?.version ?? 1;

    await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/activate`).send({ version }).expect(200);

    const r = await request(app.getHttpServer()).post(triggerPath).send({ x: 9 }).expect(200);
    expect(r.body.status).toBe("SUCCEEDED");
    expect(r.body.output.ok).toBe(true);
    expect(r.body.output.x).toBe(9);
  });
});
