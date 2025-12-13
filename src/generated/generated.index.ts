import { WfCustomerCrudController } from "./controllers/customer_crud.controller";
import { WfCustomerIoController } from "./controllers/customer_io.controller";
import { WfRiskRetryDemoController } from "./controllers/risk_retry_demo.controller";
import { WfCustomerCrudRunner } from "./runners/customer_crud.runner";
import { WfCustomerIoRunner } from "./runners/customer_io.runner";
import { WfRiskRetryDemoRunner } from "./runners/risk_retry_demo.runner";

export const GeneratedControllers = [WfCustomerCrudController, WfCustomerIoController, WfRiskRetryDemoController];
export const GeneratedRunners = [WfCustomerCrudRunner, WfCustomerIoRunner, WfRiskRetryDemoRunner];
