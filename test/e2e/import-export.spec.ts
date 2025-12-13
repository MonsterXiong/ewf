import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";
import { IrInterpreter } from "../../src/runtime/interpreter";
import { RecordingCallExecutor } from "../../src/runtime/call-executor";
import { ConnDbClient } from "../../src/generated/connectors/conn_db.stub";
import { ConnFileClient } from "../../src/generated/connectors/conn_file.stub";

test("import/export workflow works", async () => {
  const ROOT = process.cwd();
  const wf = path.join(ROOT, "workflows/.tmp.io.workflow.json");
  const irp = path.join(ROOT, "workflows/.tmp.io.ir.json");

  execSync(`node tools/render-template.js --tpl templates/import_export.template.json --inst instances/customer_io.instance.json --out ${wf}`, { stdio:"inherit" });
  execSync(`node tools/compile-authoring.js --in ${wf} --out ${irp} --registry registries/builtin.registry.json`, { stdio:"inherit" });

  const ir = JSON.parse(fs.readFileSync(irp, "utf8"));

  const store = new InMemoryRunStore();
  const clients: any = { conn_db: new ConnDbClient(), conn_file: new ConnFileClient() };
  const it = new IrInterpreter(ir, store as any, clients, new RecordingCallExecutor(store as any));

  // export
  const s1 = await it.start({ op:"export" }, {});
  expect(s1.status).toBe("SUCCEEDED");
  expect(typeof s1.output).toBe("string");
  expect(s1.output).toContain("id,name,level,email");

  // import
  const s2 = await it.start({ op:"import", csv:"id,name,level,email\nc099,Zed,normal,zed@example.com\n" }, {});
  expect(s2.status).toBe("SUCCEEDED");
  expect(s2.output.ok).toBe(true);
  expect(s2.output.inserted).toBe(1);

  // verify inserted
  const res = await clients.conn_db.SelectById({ body:{ table:"t_customer", idField:"id", id:"c099" } });
  expect(res.body.name).toBe("Zed");
});
