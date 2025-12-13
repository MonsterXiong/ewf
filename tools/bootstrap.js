const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd){
  execSync(cmd, { stdio:"inherit" });
}

function main(){
  fs.mkdirSync("workflows", { recursive:true });

  // 1) CRUD
  run(`node tools/render-template.js --tpl templates/crud.template.json --inst instances/customer_crud.instance.json --out workflows/customer_crud.workflow.json`);
  run(`node tools/compile-authoring.js --in workflows/customer_crud.workflow.json --out workflows/customer_crud.ir.json --registry registries/builtin.registry.json`);

  // 2) Import/Export
  run(`node tools/render-template.js --tpl templates/import_export.template.json --inst instances/customer_io.instance.json --out workflows/customer_io.workflow.json`);
  run(`node tools/compile-authoring.js --in workflows/customer_io.workflow.json --out workflows/customer_io.ir.json --registry registries/builtin.registry.json`);

  // 3) Retry demo（直接编译静态 workflow）
  run(`node tools/compile-authoring.js --in workflows/retry_demo.workflow.json --out workflows/retry_demo.ir.json --registry registries/builtin.registry.json`);

  // 统一 codegen
  run(`node tools/codegen.js --irs workflows/customer_crud.ir.json,workflows/customer_io.ir.json,workflows/retry_demo.ir.json --out src/generated`);

  console.log("\nBootstrap done. Now run: pnpm start\n");
}

main();
