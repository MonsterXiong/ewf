import * as fs from "fs";
import * as path from "path";
import Ajv, { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export type SchemaError = {
  source: string; // workflow / stepRegistry / connectorRegistry
  path: string;   // instancePath
  keyword?: string;
  message?: string;
  params?: any;
};

function readJson(filePath: string) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`SCHEMA_FILE_NOT_FOUND: ${abs}`);
  }
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

export class SchemaValidationService {
  private readonly ajv: Ajv;
  private readonly validators = new Map<string, ValidateFunction>();

  private readonly workflowSchemaPath = "schemas/workflow.v1.schema.json";
  private readonly stepRegistrySchemaPath = "schemas/step-registry.v1.schema.json";
  private readonly connectorRegistrySchemaPath = "schemas/connector-registry.v1.schema.json";

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true
    });
    addFormats(this.ajv);

    // preload
    this.getValidator("workflow", this.workflowSchemaPath);
    this.getValidator("stepRegistry", this.stepRegistrySchemaPath);
    this.getValidator("connectorRegistry", this.connectorRegistrySchemaPath);
  }

  private getValidator(key: string, schemaFile: string) {
    const cached = this.validators.get(key);
    if (cached) return cached;

    const schema = readJson(schemaFile);
    const v = this.ajv.compile(schema);
    this.validators.set(key, v);
    return v;
  }

  private toErrors(source: string, errors?: ErrorObject[] | null): SchemaError[] {
    if (!errors || errors.length === 0) return [];
    return errors.map((e) => ({
      source,
      path: e.instancePath && e.instancePath.length > 0 ? e.instancePath : "/",
      keyword: e.keyword,
      message: e.message,
      params: e.params
    }));
  }

  validateWorkflow(draft: any) {
    const v = this.getValidator("workflow", this.workflowSchemaPath);
    const ok = Boolean(v(draft));
    return { ok, errors: ok ? [] : this.toErrors("workflow", v.errors) };
  }

  validateStepRegistry(reg: any) {
    const v = this.getValidator("stepRegistry", this.stepRegistrySchemaPath);
    const ok = Boolean(v(reg));
    return { ok, errors: ok ? [] : this.toErrors("stepRegistry", v.errors) };
  }

  validateConnectorRegistry(reg: any) {
    const v = this.getValidator("connectorRegistry", this.connectorRegistrySchemaPath);
    const ok = Boolean(v(reg));
    return { ok, errors: ok ? [] : this.toErrors("connectorRegistry", v.errors) };
  }
}
