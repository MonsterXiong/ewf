import { execSync } from "child_process";
import mysql from "mysql2/promise";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("trigger conflict (mysql)", () => {
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

  test("strict publish rejects conflict; force publish overrides trigger", async () => {
    const wfA = `wfA_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const wfB = `wfB_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // ✅ 本次测试唯一，但 A/B 共享同一条 trigger 来制造冲突
    const triggerPath = `/internal/api/conflict_demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const draftA: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: wfA,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: [] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath }],
      graph: {
        start: { nodeId: "ret", port: "in" },
        nodes: [{ id: "ret", type: "flow.return", typeVersion: 1, inputs: { value: { const: { who: "A" } } } }],
        edges: []
      }
    };

    const draftB: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: wfB,
      version: 1,
      policies: { egress: { mode: "denyByDefault", allowConnectors: [] } },
      triggers: [{ type: "http", method: "POST", path: triggerPath }],
      graph: {
        start: { nodeId: "ret", port: "in" },
        nodes: [{ id: "ret", type: "flow.return", typeVersion: 1, inputs: { value: { const: { who: "B" } } } }],
        edges: []
      }
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfA}/draft`).send(draftA).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfA}/publish`).send({}).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfA}/activate`).send({ version: 1 }).expect(200);

    await request(app.getHttpServer()).put(`/internal/workflows/${wfB}/draft`).send(draftB).expect(200);

    // strict 冲突：必须 409 + TRIGGER_CONFLICT
    const strictRes = await request(app.getHttpServer())
      .post(`/internal/workflows/${wfB}/publish`)
      .send({})
      .expect(409);

    expect(strictRes.body.code).toBe("TRIGGER_CONFLICT");
    expect(String(strictRes.body.message)).toMatch(/TRIGGER_CONFLICT/);

    // force 覆盖
    await request(app.getHttpServer()).post(`/internal/workflows/${wfB}/publish`).send({ force: true }).expect(200);
    await request(app.getHttpServer()).post(`/internal/workflows/${wfB}/activate`).send({ version: 1 }).expect(200);

    // 访问 trigger 应命中 B
    const r = await request(app.getHttpServer()).post(triggerPath).send({}).expect(200);
    expect(r.body.status).toBe("SUCCEEDED");
    expect(r.body.output.who).toBe("B");
  });
});
