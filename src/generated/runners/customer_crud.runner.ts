import { Injectable } from "@nestjs/common";
import { IrInterpreter } from "../../runtime/interpreter";
import { CallExecutor } from "../../runtime/call-executor";
import { ConnDbClient } from "../connectors/conn_db.stub";
import IR from "../ir/customer_crud.ir.json";

@Injectable()
export class WfCustomerCrudRunner {
  private interpreter: IrInterpreter;

  constructor(
    private readonly store: any,
    private readonly callExecutor: any,
    private readonly c_conn_db: ConnDbClient
  ) {
    this.interpreter = new IrInterpreter(IR as any, this.store, {
      "conn_db": this.c_conn_db,
    } as any, this.callExecutor as CallExecutor);
  }

  async start(input: any, env?: any) {
    return this.interpreter.start(input, env);
  }

  async resume(runId: string, eventKey: string, payload: any) {
    return this.interpreter.resume(runId, eventKey, payload);
  }
}
