const fs = require("fs");
const path = require("path");

function mkdirp(p){ fs.mkdirSync(p, { recursive:true }); }
function writeFile(p, s){ mkdirp(path.dirname(p)); fs.writeFileSync(p, s, "utf8"); }
function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }

function toPascal(s){
  return s.replace(/(^|_|-)([a-z])/g, (_, __, c)=>c.toUpperCase()).replace(/[^a-zA-Z0-9]/g,"");
}

function wfNameFromId(workflowId){
  return workflowId.replace(/^wf_/, "");
}

function collectConnectors(ir){
  const set = new Set();
  for (const ins of ir.program ?? []) if (ins.op === "CALL") set.add(ins.spec.connectorId);
  return Array.from(set).filter(Boolean);
}

function argVal(args, name){
  const i = args.indexOf(name);
  if (i<0) return null;
  return args[i+1] || null;
}

function parseIrs(args){
  const irs = argVal(args, "--irs");
  if (!irs) return [];
  return irs.split(",").map((s)=>s.trim()).filter(Boolean);
}

function main(){
  const args = process.argv.slice(2);
  const irPaths = parseIrs(args);
  const outDir = argVal(args, "--out");

  if (!irPaths.length || !outDir) {
    console.log("usage: node tools/codegen.js --irs workflows/a.ir.json,workflows/b.ir.json --out src/generated");
    process.exit(1);
  }

  const genRoot = path.resolve(outDir);
  mkdirp(genRoot);

  const workflows = irPaths.map((p)=>({ path:p, ir: readJson(p) }));

  // copy IRs
  for (const w of workflows) {
    const wfName = wfNameFromId(w.ir.workflowId);
    const irOut = path.join(genRoot, "ir", `${wfName}.ir.json`);
    writeFile(irOut, JSON.stringify(w.ir, null, 2));
  }

  // per-workflow controller + runner
  const allControllers = [];
  const allRunners = [];
  const workflowMeta = []; // for providers

  for (const w of workflows) {
    const ir = w.ir;
    const wfName = wfNameFromId(ir.workflowId);
    const runnerClass = `Wf${toPascal(wfName)}Runner`;
    const controllerClass = `Wf${toPascal(wfName)}Controller`;

    allControllers.push(controllerClass);
    allRunners.push(runnerClass);

    const connectors = collectConnectors(ir);
    workflowMeta.push({ wfName, runnerClass, controllerClass, connectors });

    const trig = (ir.triggers && ir.triggers[0]) || { method:"POST", path:`/internal/${wfName}/run`, input:{ mapFrom:"body" } };
    const methodDeco = (String(trig.method).toUpperCase() === "GET") ? "Get" : "Post";

    writeFile(path.join(genRoot, "controllers", `${wfName}.controller.ts`), `
import { Body, Controller, Param, ${methodDeco} } from "@nestjs/common";
import { ${runnerClass} } from "../runners/${wfName}.runner";

@Controller()
export class ${controllerClass} {
  constructor(private readonly runner: ${runnerClass}) {}

  @${methodDeco}(${JSON.stringify(trig.path)})
  async run(@Body() body: any) {
    const input = body ?? {};
    const env = { traceId: body?.traceId, tenantId: body?.tenantId, user: body?.user };
    return this.runner.start(input, env);
  }

  @${methodDeco}("/runs/:runId/resume")
  async resume(@Param("runId") runId: string, @Body() body: any) {
    return this.runner.resume(runId, body?.eventKey, body?.payload);
  }
}
`.trimStart());

    const connectorImports = connectors.map((cid)=> {
      const cls = `Conn${toPascal(cid.replace(/^conn_/, ""))}Client`;
      return `import { ${cls} } from "../connectors/${cid}.stub";`;
    }).join("\n");

    const clientsMap = connectors.map((cid)=>{
      return `      "${cid}": this.c_${cid},`;
    }).join("\n");

    const runnerCtorParams = [
      `private readonly store: any`,
      `private readonly callExecutor: any`,
      ...connectors.map((cid)=>`private readonly c_${cid}: Conn${toPascal(cid.replace(/^conn_/, ""))}Client`)
    ].join(",\n    ");

    writeFile(path.join(genRoot, "runners", `${wfName}.runner.ts`), `
import { Injectable } from "@nestjs/common";
import { IrInterpreter } from "../../runtime/interpreter";
import { CallExecutor } from "../../runtime/call-executor";
${connectorImports}
import IR from "../ir/${wfName}.ir.json";

@Injectable()
export class ${runnerClass} {
  private interpreter: IrInterpreter;

  constructor(
    ${runnerCtorParams}
  ) {
    this.interpreter = new IrInterpreter(IR as any, this.store, {
${clientsMap}
    } as any, this.callExecutor as CallExecutor);
  }

  async start(input: any, env?: any) {
    return this.interpreter.start(input, env);
  }

  async resume(runId: string, eventKey: string, payload: any) {
    return this.interpreter.resume(runId, eventKey, payload);
  }
}
`.trimStart());
  }

  // generated.index.ts
  const controllerImports = workflowMeta.map((m)=>`import { ${m.controllerClass} } from "./controllers/${m.wfName}.controller";`).join("\n");
  const runnerImports = workflowMeta.map((m)=>`import { ${m.runnerClass} } from "./runners/${m.wfName}.runner";`).join("\n");

  writeFile(path.join(genRoot, "generated.index.ts"), `
${controllerImports}
${runnerImports}

export const GeneratedControllers = [${workflowMeta.map(m=>m.controllerClass).join(", ")}];
export const GeneratedRunners = [${workflowMeta.map(m=>m.runnerClass).join(", ")}];
`.trimStart());

  // generated.providers.ts
  const unionConnectors = Array.from(new Set(workflowMeta.flatMap((m)=>m.connectors)));
  const connectorImports2 = unionConnectors.map((cid)=>{
    const cls = `Conn${toPascal(cid.replace(/^conn_/, ""))}Client`;
    return `import { ${cls} } from "./connectors/${cid}.stub";`;
  }).join("\n");

  const connectorClasses = unionConnectors.map((cid)=>`Conn${toPascal(cid.replace(/^conn_/, ""))}Client`).join(", ");

  const runnerProviderBlocks = workflowMeta.map((m)=>{
    const inject = [`"RunStore"`, `"CallExecutor"`, ...m.connectors.map((cid)=>`Conn${toPascal(cid.replace(/^conn_/, ""))}Client`)];
    const factoryArgs = ["store:any", "callExecutor:any", ...m.connectors.map((cid)=>cid.replace(/^conn_/, "").replace(/[^a-zA-Z0-9]/g,"") + ": any")];
    const ctorArgs = ["store", "callExecutor", ...m.connectors.map((cid)=>cid.replace(/^conn_/, "").replace(/[^a-zA-Z0-9]/g,""))];

    return `
  {
    provide: ${m.runnerClass},
    useFactory: (${factoryArgs.join(", ")}) => new ${m.runnerClass}(${ctorArgs.join(", ")}),
    inject: [${inject.join(", ")}]
  }`.trim();
  }).join(",\n\n");

  writeFile(path.join(genRoot, "generated.providers.ts"), `
import { createRunStoreFromEnv } from "../runtime/runstore.factory";
import { RecordingCallExecutor } from "../runtime/call-executor";
import { GeneratedRunners } from "./generated.index";
${workflowMeta.map((m)=>`import { ${m.runnerClass} } from "./runners/${m.wfName}.runner";`).join("\n")}
${connectorImports2}

export const GeneratedProviders: any[] = [
  { provide: "RunStore", useFactory: () => createRunStoreFromEnv() },
  { provide: "CallExecutor", useFactory: (store:any)=> new RecordingCallExecutor(store), inject: ["RunStore"] },

  ${connectorClasses ? connectorClasses + "," : ""}

${runnerProviderBlocks ? runnerProviderBlocks + "," : ""}
];
`.trimStart());

  // generated.module.ts
  writeFile(path.join(genRoot, "generated.module.ts"), `
import { Module } from "@nestjs/common";
import { GeneratedControllers } from "./generated.index";
import { GeneratedProviders } from "./generated.providers";

@Module({
  controllers: [...GeneratedControllers],
  providers: [...GeneratedProviders],
  exports: [...GeneratedProviders],
})
export class GeneratedModule {}
`.trimStart());

  console.log("codegen ok:", genRoot);
}

main();
