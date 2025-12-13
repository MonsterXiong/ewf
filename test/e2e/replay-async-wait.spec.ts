import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";
import { IrInterpreter } from "../../src/runtime/interpreter";
import { RecordingCallExecutor } from "../../src/runtime/call-executor";
import { ReplayService } from "../../src/runtime/replay.service";

const ROOT = process.cwd();

test("WAIT: record + resume; replay auto-resumes using recorded WAIT_RESUME payload", async () => {
  const wf = path.join(ROOT, "test/fixtures/workflows/wait_demo.workflow.json");
  const irp = path.join(ROOT, "workflows/.tmp.wait_demo.ir.json");

  execSync(`node tools/compile-authoring.js --in ${wf} --out ${irp} --registry registries/builtin.registry.json`, { stdio:"inherit" });
  const ir = JSON.parse(fs.readFileSync(irp, "utf8"));

  const store = new InMemoryRunStore();
  const it = new IrInterpreter(ir, store as any, {}, new RecordingCallExecutor(store as any));

  // start -> WAITING
  const s1 = await it.start({ id:"c001" }, {});
  expect(s1.status).toBe("WAITING");
  expect(s1.waiting?.eventKey).toBe("ev:c001");

  // resume -> SUCCEEDED
  const s2 = await it.resume(s1.runId, "ev:c001", { token:"ok", n: 1 });
  expect(s2.status).toBe("SUCCEEDED");
  expect(s2.output.token).toBe("ok");

  // replay using ReplayService should auto resume with recorded payload
  const replaySvc = new ReplayService(store as any);
  const s3 = await replaySvc.replayRecorded(ir, s1.runId);

  expect(s3.status).toBe("SUCCEEDED");
  expect(JSON.stringify(s3.output)).toBe(JSON.stringify(s2.output));
});
