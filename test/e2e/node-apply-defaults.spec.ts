import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

describe("nodes apply-defaults", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("fills default inputs from meta.defaultValue", async () => {
    const draft: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      compiler: "plugin",
      id: "wf_defaults",
      version: 1,
      graph: {
        start: { nodeId: "n_call", port: "in" },
        nodes: [
          {
            id: "n_call",
            type: "conn.call",
            typeVersion: 1,
            inputs: {
              connectorId: { const: "conn_http" },
              operationId: { const: "request" },
              // body 缺失，应被补成 {const:{}}
            },
          },
          {
            id: "n_wait",
            type: "flow.awaitEvent",
            typeVersion: 1,
            inputs: {
              eventKey: { const: "ev:1" },
              // timeoutMs 缺失，应补 {const:0}
            },
          },
        ],
        edges: [
          { from: { nodeId: "n_call", port: "out" }, to: { nodeId: "n_wait", port: "in" } },
        ],
      },
    };

    const r = await request(app.getHttpServer())
      .post("/internal/nodes/apply-defaults")
      .send(draft)
      .expect(200);

    const nodes = r.body.graph.nodes;
    const call = nodes.find((n: any) => n.id === "n_call");
    const wait = nodes.find((n: any) => n.id === "n_wait");

    expect(call.inputs.body).toEqual({ const: {} });
    expect(wait.inputs.timeoutMs).toEqual({ const: 0 });
  });
});
