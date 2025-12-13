import { createRunStoreFromEnv } from "../runtime/runstore.factory";
import { RecordingCallExecutor } from "../runtime/call-executor";
import { GeneratedRunners } from "./generated.index";
import { WfCustomerCrudRunner } from "./runners/customer_crud.runner";
import { WfCustomerIoRunner } from "./runners/customer_io.runner";
import { WfRiskRetryDemoRunner } from "./runners/risk_retry_demo.runner";
import { ConnDbClient } from "./connectors/conn_db.stub";
import { ConnFileClient } from "./connectors/conn_file.stub";
import { ConnRiskServiceClient } from "./connectors/conn_risk_service.stub";

export const GeneratedProviders: any[] = [
  { provide: "RunStore", useFactory: () => createRunStoreFromEnv() },
  { provide: "CallExecutor", useFactory: (store:any)=> new RecordingCallExecutor(store), inject: ["RunStore"] },

  ConnDbClient, ConnFileClient, ConnRiskServiceClient,

{
    provide: WfCustomerCrudRunner,
    useFactory: (store:any, callExecutor:any, db: any) => new WfCustomerCrudRunner(store, callExecutor, db),
    inject: ["RunStore", "CallExecutor", ConnDbClient]
  },

{
    provide: WfCustomerIoRunner,
    useFactory: (store:any, callExecutor:any, db: any, file: any) => new WfCustomerIoRunner(store, callExecutor, db, file),
    inject: ["RunStore", "CallExecutor", ConnDbClient, ConnFileClient]
  },

{
    provide: WfRiskRetryDemoRunner,
    useFactory: (store:any, callExecutor:any, riskservice: any) => new WfRiskRetryDemoRunner(store, callExecutor, riskservice),
    inject: ["RunStore", "CallExecutor", ConnRiskServiceClient]
  },
];
