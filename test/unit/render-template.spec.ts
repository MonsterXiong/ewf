import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

test("render-template: crud template -> authoring workflow", () => {
  const tpl = path.join(ROOT, "templates/crud.template.json");
  const inst = path.join(ROOT, "instances/customer_crud.instance.json");
  const out = path.join(ROOT, "workflows/.tmp.customer.workflow.json");

  execSync(`node tools/render-template.js --tpl ${tpl} --inst ${inst} --out ${out}`, { stdio: "inherit" });
  const wf = JSON.parse(fs.readFileSync(out, "utf8"));

  expect(wf.kind).toBe("ewf.workflow");
  expect(wf.triggers[0].path).toContain("/internal/customer/crud");
});
