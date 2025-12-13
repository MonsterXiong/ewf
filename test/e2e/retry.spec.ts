import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";
import { IrInterpreter } from "../../src/runtime/interpreter";
import { RecordingCallExecutor } from "../../src/runtime/call-executor";
import { ConnRiskServiceClient } from "../../src/generated/connectors/conn_risk_service.stub";

test("retry records attempts and finally succeeds", async () => {
  const ROOT = process.cwd();
  const irp = path.join(ROOT, "workflows/.tmp.retry.ir.json");

  execSync(`node tools/compile-authoring.js --in workflows/retry_demo.workflow.json --out ${irp} --registry registries/builtin.registry.json`, { stdio:"inherit" });
  const ir = JSON.parse(fs.readFileSync(irp, "utf8"));

  const store = new InMemoryRunStore();
  const clients: any = { conn_risk_service: new ConnRiskServiceClient() };
  const it = new IrInterpreter(ir, store as any, clients, new RecordingCallExecutor(store as any));

  const s = await it.start({ id:"c001" }, {});
  expect(s.status).toBe("SUCCEEDED");
  expect(s.output.attemptsUsed).toBe(3);

  // 录制里应该存在 attempt 0/1 的失败 + attempt 2 的成功
  const r0 = await store.getCallRecord(s.runId, "main", "n_get_risk", 0, 0);
  const r1 = await store.getCallRecord(s.runId, "main", "n_get_risk", 0, 1);
  const r2 = await store.getCallRecord(s.runId, "main", "n_get_risk", 0, 2);
  expect((r0 as any).outcome.ok).toBe(false);
  expect((r1 as any).outcome.ok).toBe(false);
  expect((r2 as any).outcome.ok).toBe(true);
});
