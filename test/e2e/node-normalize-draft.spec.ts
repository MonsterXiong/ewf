import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

describe("nodes normalize-draft", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("reordered draft should produce identical normalized draft + digest", async () => {
    const base: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      compiler: "plugin",
      id: "wf_norm",
      version: 1,
      graph: {
        start: { nodeId: "n_fork", port: "in" },
        nodes: [
          { id: "n_merge", type: "flow.merge", typeVersion: 1 },
          { id: "n_ret", type: "flow.return", typeVersion: 1, inputs: { value: { const: { ok: true } } } },
          { id: "n_fork", type: "flow.fork", typeVersion: 1, inputs: { mergeNodeId: { const: "n_merge" } } },
          {
            id: "n_b1",
            type: "conn.call",
            typeVersion: 1,
            inputs: { connectorId: { const: "conn_http" }, operationId: { const: "request" } } // body 缺失：normalize 应补默认
          },
          {
            id: "n_b2",
            type: "conn.call",
            typeVersion: 1,
            inputs: { connectorId: { const: "conn_http" }, operationId: { const: "request" } } // body 缺失
          },
        ],
        edges: [
          { from: { nodeId: "n_merge", port: "out" }, to: { nodeId: "n_ret", port: "in" } },
          { from: { nodeId: "n_b2", port: "out" }, to: { nodeId: "n_merge", port: "in" } },
          { from: { nodeId: "n_fork", port: "b2" }, to: { nodeId: "n_b2", port: "in" } },
          { from: { nodeId: "n_b1", port: "out" }, to: { nodeId: "n_merge", port: "in" } },
          { from: { nodeId: "n_fork", port: "b1" }, to: { nodeId: "n_b1", port: "in" } },
        ],
      },
    };

    // same semantic, different ordering + extra unordered keys
    const shuffled: any = JSON.parse(JSON.stringify(base));
    shuffled.graph.nodes = [base.graph.nodes[2], base.graph.nodes[4], base.graph.nodes[1], base.graph.nodes[0], base.graph.nodes[3]];
    shuffled.graph.edges = [base.graph.edges[4], base.graph.edges[2], base.graph.edges[0], base.graph.edges[1], base.graph.edges[3]];

    const r1 = await request(app.getHttpServer()).post("/internal/nodes/normalize-draft").send(base).expect(200);
    const r2 = await request(app.getHttpServer()).post("/internal/nodes/normalize-draft").send(shuffled).expect(200);

    expect(r1.body.digest.draftSha256).toBe(r2.body.digest.draftSha256);
    expect(r1.body.draft).toEqual(r2.body.draft);

    // normalize 会补默认 body
    const b1 = r1.body.draft.graph.nodes.find((n: any) => n.id === "n_b1");
    expect(b1.inputs.body).toEqual({ const: {} });

    // 如果能编译成功，也应提供 irSha256（可能 undefined，但通常应有）
    expect(typeof r1.body.digest.draftSha256).toBe("string");
  });
});
