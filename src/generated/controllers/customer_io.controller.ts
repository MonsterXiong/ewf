import { Body, Controller, Param, Post } from "@nestjs/common";
import { WfCustomerIoRunner } from "../runners/customer_io.runner";

@Controller()
export class WfCustomerIoController {
  constructor(private readonly runner: WfCustomerIoRunner) {}

  @Post("/internal/customer/io")
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
