import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";
import { IrInterpreter } from "../../src/runtime/interpreter";
import { RecordingCallExecutor } from "../../src/runtime/call-executor";

const ROOT = process.cwd();

test("fork guard: writing vars.* in fork (except vars.__branch.*) throws", async () => {
  const wf = path.join(ROOT, "test/fixtures/workflows/fork_illegal_write.workflow.json");
  const irp = path.join(ROOT, "workflows/.tmp.fork_illegal_write.ir.json");

  execSync(`node tools/compile-authoring.js --in ${wf} --out ${irp} --registry registries/builtin.registry.json`, { stdio:"inherit" });
  const ir = JSON.parse(fs.readFileSync(irp, "utf8"));

  const store = new InMemoryRunStore();
  const it = new IrInterpreter(ir, store as any, {}, new RecordingCallExecutor(store as any));

  // 这里预期直接抛出 FORK_SCOPE_WRITE_VARS_FORBIDDEN
  await expect(it.start({}, {})).rejects.toThrow(/FORK_SCOPE_WRITE_VARS_FORBIDDEN/);
});
