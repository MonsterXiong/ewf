import { execSync } from "child_process";
import mysql from "mysql2/promise";
import { MySqlRunStore } from "../../src/runtime/store.mysql";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";

const mysqlUrl = process.env.EWF_TEST_MYSQL_URL;

test("RunStore contract: inmem always works", async () => {
  const store = new InMemoryRunStore();

  const initial: any = {
    runId: "temp",
    workflowId: "wf_x",
    workflowVersion: 1,
    status: "RUNNING",
    pc: 0,
    ctx: { env: { __scopeId:"main", __counters:{} }, vars: { __input:{} }, steps:{} }
  };

  const runId = await store.createRun("wf_x", 1, initial);
  initial.runId = runId;
  initial.status = "WAITING";
  initial.waiting = { eventKey: "ev:1", waitStepId: "n_wait" };
  await store.save(initial);

  const loaded = await store.load(runId);
  expect(loaded?.status).toBe("WAITING");
  expect(loaded?.waiting?.eventKey).toBe("ev:1");

  await store.appendReplayRecord({
    kind: "WAIT_RESUME",
    runId,
    scopeId: "main",
    stepId: "n_wait",
    resumeIndex: 0,
    payload: { ok: true },
    recordedAt: Date.now()
  } as any);

  const rec = await store.getWaitRecord(runId, "main", "n_wait", 0);
  expect((rec as any)?.payload?.ok).toBe(true);
});

(mysqlUrl ? describe : describe.skip)("RunStore contract: mysql", () => {
  let pool: mysql.Pool;

  beforeAll(() => {
    process.env.EWF_MYSQL_URL = mysqlUrl!;
    execSync(`node tools/mysql-init.js`, { stdio: "inherit", env: process.env as any });

    // ✅ 用一个共享 pool，测试结束时关闭它
    pool = mysql.createPool(mysqlUrl!);
  });

  afterAll(async () => {
    await pool.end(); // ✅ 关键：让 Jest 能退出
  });

  test("mysql: create/save/load + replay record roundtrip", async () => {
    const store = new MySqlRunStore(pool as any);

    const initial: any = {
      runId: "temp",
      workflowId: "wf_x",
      workflowVersion: 1,
      status: "RUNNING",
      pc: 0,
      ctx: { env: { __scopeId:"main", __counters:{} }, vars: { __input:{} }, steps:{} }
    };

    const runId = await store.createRun("wf_x", 1, initial);
    initial.runId = runId;
    initial.status = "WAITING";
    initial.waiting = { eventKey: "ev:1", waitStepId: "n_wait" };
    await store.save(initial);

    const loaded = await store.load(runId);
    expect(loaded?.status).toBe("WAITING");
    expect(loaded?.waiting?.eventKey).toBe("ev:1");

    await store.appendReplayRecord({
      kind: "WAIT_RESUME",
      runId,
      scopeId: "main",
      stepId: "n_wait",
      resumeIndex: 0,
      payload: { ok: true },
      recordedAt: Date.now()
    } as any);

    const rec = await store.getWaitRecord(runId, "main", "n_wait", 0);
    expect((rec as any)?.payload?.ok).toBe(true);
  });
});
