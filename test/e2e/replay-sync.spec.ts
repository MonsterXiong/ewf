import fs from "fs";
import path from "path";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";
import { IrInterpreter } from "../../src/runtime/interpreter";
import { RecordingCallExecutor, ReplayCallExecutor } from "../../src/runtime/call-executor";

test("recorded replay sync: output equal and no real connector call", async () => {
  const store = new InMemoryRunStore();

  // 这里用一个最小 IR（直接用 customer_crud 生成出来的 IR）
  const irPath = path.join(process.cwd(), "src/generated/ir/customer_crud.ir.json");
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));

  let calls = 0;
  const clients:any = {
    conn_db: {
      SelectPage: async ()=>{ calls++; return { status:200, headers:{}, body:{ total:0, items:[] } }; }
    }
  };

  const rec = new RecordingCallExecutor(store as any);
  const it1 = new IrInterpreter(ir, store as any, clients, rec);
  const s1 = await it1.start({ op:"list", page:1, pageSize:10 }, {});
  expect(s1.status).toBe("SUCCEEDED");
  const before = calls;

  const rep = new ReplayCallExecutor(store as any, s1.runId);
  const it2 = new IrInterpreter(ir, store as any, {}, rep);
  const s2 = await it2.start({ op:"list", page:1, pageSize:10 }, {});
  expect(s2.status).toBe("SUCCEEDED");
  expect(JSON.stringify(s2.output)).toBe(JSON.stringify(s1.output));
  expect(calls).toBe(before);
});
