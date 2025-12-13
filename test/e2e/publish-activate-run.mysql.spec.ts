import { execSync } from "child_process";
import mysql from "mysql2/promise";
import { RecordingCallExecutor } from "../../src/runtime/call-executor";
import { MySqlRunStore } from "../../src/runtime/store.mysql";
import { WorkflowRepo } from "../../src/workflow/workflow.repo";
import { CompilerBridge } from "../../src/workflow/compiler.bridge";
import { WorkflowService } from "../../src/workflow/workflow.service";
import { WorkflowRuntime } from "../../src/workflow/workflow.runtime";
import { PluginCompilerService } from "../../src/workflow/compiler.plugin.service";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

(mysqlUrl ? describe : describe.skip)("publish/activate/run (mysql)", () => {
  let pool: mysql.Pool;

  beforeAll(() => {
    process.env.EWF_MYSQL_URL = mysqlUrl!;
    execSync(`node tools/mysql-init.js`, { stdio: "inherit", env: process.env as any });
    pool = mysql.createPool(mysqlUrl!);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("draft -> publish v1 -> activate -> run; then publish v2 -> activate -> run", async () => {
    const repo = new WorkflowRepo(pool);
    const compiler = new CompilerBridge();
    const pcs = new PluginCompilerService(); // ✅ 新增
    const svc = new WorkflowService(repo, compiler, pcs); // ✅ 修复：传 3 个参数

    const store = new MySqlRunStore(pool as any);
    const exec = new RecordingCallExecutor(store as any);
    const rt = new WorkflowRuntime(repo, store as any, exec as any, {});

    const workflowId = `wf_echo_publish_demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const triggerPath = `/internal/api/${workflowId}/echo`;

    const draftV1: any = {
      kind: "ewf.workflow",
      schemaVersion: "1.0",
      id: workflowId,
      version: 1,
      triggers: [{ type: "http", method: "POST", path: triggerPath, input: { mapFrom: "body" } }],
      graph: {
        start: { nodeId: "n_return", port: "in" },
        nodes: [
          {
            id: "n_return",
            type: "flow.return",
            typeVersion: 1,
            inputs: { value: { expr: { lang: "jsonata", body: "{ 'v': 1, 'x': vars.x }" } } },
          },
        ],
        edges: [],
      },
    };

    await svc.saveDraft(workflowId, draftV1);
    const pub1 = await svc.publish(workflowId);
    expect(pub1.version).toBe(1);

    await svc.activate(workflowId, 1);

    const r1 = await rt.runActive(workflowId, { x: 42 }, { traceId: "t1" });
    expect(r1.status).toBe("SUCCEEDED");
    expect(r1.output.v).toBe(1);
    expect(r1.output.x).toBe(42);

    const draftV2 = JSON.parse(JSON.stringify(draftV1));
    draftV2.graph.nodes[0].inputs.value.expr.body = "{ 'v': 2, 'x': vars.x }";

    await svc.saveDraft(workflowId, draftV2);
    const pub2 = await svc.publish(workflowId);
    expect(pub2.version).toBe(2);

    await svc.activate(workflowId, 2);

    const r2 = await rt.runActive(workflowId, { x: 7 }, { traceId: "t2" });
    expect(r2.status).toBe("SUCCEEDED");
    expect(r2.output.v).toBe(2);
    expect(r2.output.x).toBe(7);
  });
});
