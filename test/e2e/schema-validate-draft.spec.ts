import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";

describe("workflow schema + registry self-check: validate-draft", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("invalid workflow (missing required fields) -> ok=false with readable errors", async () => {
    const bad = {
      kind: "ewf.workflow",
      schemaVersion: "1.0"
      // missing: id/version/graph
    };

    const r = await request(app.getHttpServer())
      .post("/internal/nodes/validate-draft")
      .send(bad)
      .expect(200);

    expect(r.body.ok).toBe(false);
    expect(Array.isArray(r.body.errors)).toBe(true);

    // 兼容：不同实现的错误文案不同，只要能看出“必填缺失”即可
    expect(String(JSON.stringify(r.body.errors))).toMatch(/required|missing|graph|id|version/i);

    // 如果实现返回了 details，则做更强校验（可选）
    if (r.body.details) {
      expect(typeof r.body.details.schemaOk).toBe("boolean");
      expect(Array.isArray(r.body.details.schemaErrors)).toBe(true);
    }
  });

  it("minimal valid workflow -> ok=true", async () => {
    const good = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: "wf_schema_demo",
      version: 1,
      compiler: "plugin",
      triggers: [{ type: "http", method: "POST", path: "/internal/api/schema-demo" }],
      graph: {
        start: { nodeId: "n1", port: "out" },
        nodes: [
          {
            id: "n1",
            type: "conn.call",
            typeVersion: 1,
            inputs: {
              connectorId: { const: "conn_http" },
              operationId: { const: "echo" },
              body: { const: { hello: "world" } }
            }
          }
        ],
        edges: []
      }
    };

    const r = await request(app.getHttpServer())
      .post("/internal/nodes/validate-draft")
      .send(good)
      .expect(200);

    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.errors)).toBe(true);
    expect(r.body.errors.length).toBe(0);

    // details 字段是可选增强：存在就验证，不存在不阻断主线
    if (r.body.details) {
      expect(r.body.details.schemaOk).toBe(true);
      expect(r.body.details.registryOk).toBe(true);
    }
  });
});
