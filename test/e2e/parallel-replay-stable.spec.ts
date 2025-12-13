import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { InMemoryRunStore } from "../../src/runtime/store.inmem";
import { IrInterpreter } from "../../src/runtime/interpreter";
import { RecordingCallExecutor, ReplayCallExecutor } from "../../src/runtime/call-executor";

const sleep = (ms:number)=> new Promise(r=>setTimeout(r, ms));
const ROOT = process.cwd();

test("parallel + CALL + random delays: replay stable and no real calls during replay", async () => {
  const wf = path.join(ROOT, "test/fixtures/workflows/parallel_calls_joinmerge.workflow.json");
  const irp = path.join(ROOT, "workflows/.tmp.parallel_calls_joinmerge.ir.json");

  execSync(`node tools/compile-authoring.js --in ${wf} --out ${irp} --registry registries/builtin.registry.json`, { stdio:"inherit" });
  const ir = JSON.parse(fs.readFileSync(irp, "utf8"));

  const store = new InMemoryRunStore();

  let realCalls = 0;
  const clients:any = {
    conn_user_service: {
      GetCustomer: async (req:any)=>{ realCalls++; await sleep(Math.random()*30); return { status:200, headers:{}, body:{ id:req.body.id, name:"Alice" } }; }
    },
    conn_risk_service: {
      GetRisk: async (req:any)=>{ realCalls++; await sleep(Math.random()*30); return { status:200, headers:{}, body:{ id:req.body.id, score:0.2 } }; }
    }
  };

  // record run
  const it1 = new IrInterpreter(ir, store as any, clients, new RecordingCallExecutor(store as any));
  const s1 = await it1.start({ id:"c001" }, { traceId:"tP1" });
  expect(s1.status).toBe("SUCCEEDED");
  expect(s1.output.customer.name).toBe("Alice");
  expect(typeof s1.output.risk.score).toBe("number");
  const before = realCalls;
  expect(before).toBeGreaterThanOrEqual(2);

  // replay run (no clients)
  const it2 = new IrInterpreter(ir, store as any, {}, new ReplayCallExecutor(store as any, s1.runId));
  const s2 = await it2.start({ id:"c001" }, { traceId:"tP2" });

  expect(s2.status).toBe("SUCCEEDED");
  expect(JSON.stringify(s2.output)).toBe(JSON.stringify(s1.output));
  expect(realCalls).toBe(before);
});
