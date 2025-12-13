import { Body, Controller, Param, Post } from "@nestjs/common";
import { WfCustomerCrudRunner } from "../runners/customer_crud.runner";

@Controller()
export class WfCustomerCrudController {
  constructor(private readonly runner: WfCustomerCrudRunner) {}

  @Post("/internal/customer/crud")
  async run(@Body() body: any) {
    const input = body ?? {};
    const env = { traceId: body?.traceId, tenantId: body?.tenantId, user: body?.user };
    return this.runner.start(input, env);
  }

  @Post("/runs/:runId/resume")
  async resume(@Param("runId") runId: string, @Body() body: any) {
    return this.runner.resume(runId, body?.eventKey, body?.payload);
  }
}
