import { Injectable } from "@nestjs/common";
import { IrInterpreter } from "../../runtime/interpreter";
import { CallExecutor } from "../../runtime/call-executor";
import { ConnRiskServiceClient } from "../connectors/conn_risk_service.stub";
import IR from "../ir/risk_retry_demo.ir.json";

@Injectable()
export class WfRiskRetryDemoRunner {
  private interpreter: IrInterpreter;

  constructor(
    private readonly store: any,
    private readonly callExecutor: any,
    private readonly c_conn_risk_service: ConnRiskServiceClient
  ) {
    this.interpreter = new IrInterpreter(IR as any, this.store, {
      "conn_risk_service": this.c_conn_risk_service,
    } as any, this.callExecutor as CallExecutor);
  }

  async start(input: any, env?: any) {
    return this.interpreter.start(input, env);
  }

  async resume(runId: string, eventKey: string, payload: any) {
    return this.interpreter.resume(runId, eventKey, payload);
  }
}
