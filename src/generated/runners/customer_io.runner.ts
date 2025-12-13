import { Injectable } from "@nestjs/common";
import { IrInterpreter } from "../../runtime/interpreter";
import { CallExecutor } from "../../runtime/call-executor";
import { ConnDbClient } from "../connectors/conn_db.stub";
import { ConnFileClient } from "../connectors/conn_file.stub";
import IR from "../ir/customer_io.ir.json";

@Injectable()
export class WfCustomerIoRunner {
  private interpreter: IrInterpreter;

  constructor(
    private readonly store: any,
    private readonly callExecutor: any,
    private readonly c_conn_db: ConnDbClient,
    private readonly c_conn_file: ConnFileClient
  ) {
    this.interpreter = new IrInterpreter(IR as any, this.store, {
      "conn_db": this.c_conn_db,
      "conn_file": this.c_conn_file,
    } as any, this.callExecutor as CallExecutor);
  }

  async start(input: any, env?: any) {
    return this.interpreter.start(input, env);
  }

  async resume(runId: string, eventKey: string, payload: any) {
    return this.interpreter.resume(runId, eventKey, payload);
  }
}
