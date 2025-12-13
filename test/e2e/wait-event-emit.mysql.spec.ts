import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("wait + events/emit (mysql)", () => {
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

  test("gateway starts WAITING; emit resumes to SUCCEEDED", async () => {
    const wfId = `wf_wait_emit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${wfId}/start`;

    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: wfId,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: [] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath, input: { mapFrom: "body" } }],
      graph: {
        start: { nodeId: "n_wait", port: "in" },
        nodes: [
          {
            id: "n_wait",
            type: "flow.awaitEvent",
            typeVersion: 1,
            inputs: {
              eventKey: { expr: { lang: "jsonata", body: "'ev:' & vars.id" } },
              timeoutMs: { const: 0 }
            }
          },
          { id: "n_ret", type: "flow.return", typeVersion: 1, inputs: { value: { ref: "steps.n_wait.output" } } }
        ],
        edges: [{ from: { nodeId: "n_wait", port: "out" }, to: { nodeId: "n_ret", port: "in" } }]
      }
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfId}/draft`).send(draft).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/activate`).send({ version: 1 }).expect(200);

    const started = await request(app.getHttpServer()).post(triggerPath).send({ id: "c001" }).expect(200);
    expect(started.body.status).toBe("WAITING");
    const eventKey = started.body.waiting.eventKey;
    expect(eventKey).toBe("ev:c001");

    const resumed = await request(app.getHttpServer())
      .post(`/internal/events/emit`)
      .send({ eventKey, payload: { token: "ok" } })
      .expect(200);

    expect(resumed.body.status).toBe("SUCCEEDED");
    expect(resumed.body.output.token).toBe("ok");
  });
});
