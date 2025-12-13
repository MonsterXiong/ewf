import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { WorkflowRepo } from "../../src/workflow/workflow.repo";
import { computeIrDigest } from "../../src/workflow/ir-digest";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("connector: conn_http (mysql)", () => {
  let pool: mysql.Pool;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EWF_MYSQL_URL = mysqlUrl!;
    execSync(`node tools/mysql-init.js`, { stdio: "inherit", env: process.env as any });

    pool = mysql.createPool(mysqlUrl!);

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();

    // ✅ listen(0) 让 fetch 能真实走 http
    await app.listen(0);
    const url = await app.getUrl();

    // 把 conn_http baseUrl 写入 DB 配置（也可用 env）
    await request(app.getHttpServer())
      .put(`/internal/connectors/conn_http/config`)
      .send({ baseUrl: url, timeoutMs: 3000 })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  test("trigger -> CALL conn_http -> mock upstream echo -> RETURN", async () => {
    const repo = new WorkflowRepo(pool);

    const wfId = `wf_conn_http_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${wfId}/call-upstream`;

    // IR：start -> CALL(conn_http.request) -> RETURN(steps.c1.output)
    const ir: any = {
      workflowId: wfId,
      workflowVersion: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: ["conn_http"] } },
      program: [
        { op: "LABEL", name: "start" },
        {
          op: "CALL",
          id: "c1",
          spec: { connectorId: "conn_http", operationId: "request" },
          inputs: {
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
        { op: "RETURN", output: { ref: "steps.c1.output" } },
      ],
    };

    const digest = computeIrDigest(ir);
    const pub = await repo.publishRelease(wfId, { kind: "authoring.placeholder", id: wfId }, ir, digest);

    await repo.upsertTriggersForWorkflow(wfId, [{ method: "POST", path: triggerPath }], true);
    await repo.setActive(wfId, pub.version);

    const r = await request(app.getHttpServer())
      .post(triggerPath)
      .send({ x: 123 })
      .expect(200);

    expect(r.body.status).toBe("SUCCEEDED");
    expect(r.body.output.ok).toBe(true);
    expect(r.body.output.received.x).toBe(123);
  });
});
