import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

export class CompilerBridge {
  compileAuthoringToIr(authoring: any): any {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ewf-compile-"));
    const inFile = path.join(tmpDir, "authoring.workflow.json");
    const outFile = path.join(tmpDir, "out.ir.json");

    fs.writeFileSync(inFile, JSON.stringify(authoring, null, 2), "utf8");

    const node = process.execPath;
    const tool = path.resolve("tools/compile-authoring.js");
    const registry = path.resolve("registries/builtin.registry.json");

    execFileSync(node, [tool, "--in", inFile, "--out", outFile, "--registry", registry], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    const ir = JSON.parse(fs.readFileSync(outFile, "utf8"));
    return ir;
  }
}
