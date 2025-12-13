import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

describe("node catalog", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("GET /internal/nodes/catalog returns builtin node metas", async () => {
    const r = await request(app.getHttpServer()).get("/internal/nodes/catalog").expect(200);
    expect(Array.isArray(r.body)).toBe(true);

    const types = r.body.map((x: any) => `${x.type}@${x.version}`);
    expect(types).toContain("conn.call@1");
    expect(types).toContain("flow.return@1");
    expect(types).toContain("flow.awaitEvent@1");
    expect(types).toContain("flow.if@1");
    expect(types).toContain("flow.fork@1");
    expect(types).toContain("flow.merge@1");

    const iff = r.body.find((x: any) => x.type === "flow.if" && x.version === 1);
    expect(iff.meta.inputs.find((i: any) => i.name === "mergeNodeId").constOnly).toBe(true);
  });
});
