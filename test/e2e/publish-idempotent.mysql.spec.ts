import { execSync } from "child_process";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("publish idempotent (mysql)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EWF_MYSQL_URL = mysqlUrl!;
    execSync(`node tools/mysql-init.js`, { stdio: "inherit", env: process.env as any });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("same draft publish twice -> same version reused", async () => {
    const wfId = `wf_idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
        start: { nodeId: "n_ret", port: "in" },
        nodes: [{ id: "n_ret", type: "flow.return", typeVersion: 1, inputs: { value: { const: { ok: true } } } }],
        edges: [],
      },
    };

    await request(app.getHttpServer()).put(`/internal/workflows/${wfId}/draft`).send(draft).expect(200);

    const p1 = await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    const v1 = p1.body.version ?? 1;

    const p2 = await request(app.getHttpServer()).post(`/internal/workflows/${wfId}/publish`).send({}).expect(200);
    const v2 = p2.body.version ?? 1;

    expect(v2).toBe(v1);
    expect(p2.body.reused).toBe(true);
    expect(typeof p2.body.digest?.draftSha256).toBe("string");
  });
});
