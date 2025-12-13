import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

test("IR digest deterministic: compile twice -> same sha256", () => {
  const wf = path.join(ROOT, "workflows/retry_demo.workflow.json");
  const a = path.join(ROOT, "workflows/.tmp.retry.a.ir.json");
  const b = path.join(ROOT, "workflows/.tmp.retry.b.ir.json");

  execSync(`node tools/compile-authoring.js --in ${wf} --out ${a} --registry registries/builtin.registry.json`, { stdio:"inherit" });
  execSync(`node tools/compile-authoring.js --in ${wf} --out ${b} --registry registries/builtin.registry.json`, { stdio:"inherit" });

  const ha = execSync(`node tools/hash-ir.js ${a}`).toString().trim();
  const hb = execSync(`node tools/hash-ir.js ${b}`).toString().trim();
  expect(ha).toBe(hb);

  // 清理可选
  fs.existsSync(a) && fs.unlinkSync(a);
  fs.existsSync(b) && fs.unlinkSync(b);
});
