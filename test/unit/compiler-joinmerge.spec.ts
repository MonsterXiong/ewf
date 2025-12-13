import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

test("compile: parallel_joinmerge compiles", () => {
  const inWf = path.join(ROOT, "test/fixtures/workflows/parallel_joinmerge.workflow.json");
  const outIr = path.join(ROOT, "workflows/.tmp.parallel.ir.json");

  execSync(`node tools/compile-authoring.js --in ${inWf} --out ${outIr} --registry registries/builtin.registry.json`, { stdio: "inherit" });
  const ir = JSON.parse(fs.readFileSync(outIr, "utf8"));
  expect(ir.kind).toBe("ewf.ir");
  expect(ir.program.some((x:any)=>x.op==="FORK_ALL")).toBe(true);
});
