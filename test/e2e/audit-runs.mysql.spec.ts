import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("audit runs (mysql)", () => {
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

  test("run via gateway then query audit list/detail", async () => {
    const wfId = `wf_audit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${wfId}/echo`;

    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: wfId,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: [] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath, input: { mapFrom: "body" } }],
      graph: {
        start: { nodeId: "ret", port: "in" },
        nodes: [{ id: "ret", type: "flow.return", typeVersion: 1, inputs: { value: { expr: { lang: "jsonata", body: "{ 'x': vars.x }" } } } }],
        edges: []
      }
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfId}/draft`).send(draft).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/activate`).send({ version: 1 }).expect(200);

    const run = await request(app.getHttpServer()).post(triggerPath).send({ x: 1 }).expect(200);
    expect(run.body.status).toBe("SUCCEEDED");
    const runId = run.body.runId;

    const list = await request(app.getHttpServer())
      .get(`/internal/audit/runs?workflowId=${wfId}&limit=20`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.find((r: any) => r.runId === runId)).toBeTruthy();

    const detail = await request(app.getHttpServer())
      .get(`/internal/audit/runs/${runId}`)
      .expect(200);

    expect(detail.body.runId).toBe(runId);
    expect(detail.body.workflowId).toBe(wfId);
  });
});
