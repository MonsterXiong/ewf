import { Body, Controller, Param, Post } from "@nestjs/common";
import { WfRiskRetryDemoRunner } from "../runners/risk_retry_demo.runner";

@Controller()
export class WfRiskRetryDemoController {
  constructor(private readonly runner: WfRiskRetryDemoRunner) {}

  @Post("/internal/risk/retry-demo")
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
