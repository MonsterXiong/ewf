import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

describe("nodes validate-draft", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("invalid draft returns ok=false with errors", async () => {
    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      compiler: "plugin",
      id: "wf_validate_bad",
      version: 1,
      graph: {
        start: { nodeId: "n_call", port: "in" },
        nodes: [
          {
            id: "n_call",
            type: "conn.call",
            typeVersion: 1,
            // 缺 operationId/body
            inputs: { connectorId: { const: "conn_http" } },
          },
        ],
        edges: [],
      },
    };

    const r = await request(app.getHttpServer())
      .post("/internal/nodes/validate-draft")
      .send(draft)
      .expect(200);

    expect(r.body.ok).toBe(false);
    expect(Array.isArray(r.body.errors)).toBe(true);
    expect(JSON.stringify(r.body.errors)).toMatch(/NODE_INPUT_REQUIRED/);
  });

  test("valid draft returns ok=true", async () => {
    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      compiler: "plugin",
      id: "wf_validate_ok",
      version: 1,
      graph: {
        start: { nodeId: "n_ret", port: "in" },
        nodes: [
          {
            id: "n_ret",
            type: "flow.return",
            typeVersion: 1,
            inputs: { value: { const: { ok: true } } },
          },
        ],
        edges: [],
      },
    };

    const r = await request(app.getHttpServer())
      .post("/internal/nodes/validate-draft")
      .send(draft)
      .expect(200);

    expect(r.body.ok).toBe(true);
    expect(r.body.errors.length).toBe(0);
  });
});
