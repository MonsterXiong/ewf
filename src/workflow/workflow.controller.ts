import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { WorkflowService } from "./workflow.service";
import { WorkflowRuntime } from "./workflow.runtime";

@Controller("/internal/workflows")
export class WorkflowController {
  constructor(
    private readonly svc: WorkflowService,
    private readonly rt: WorkflowRuntime
  ) {}

  @Put("/:workflowId/draft")
  async saveDraft(@Param("workflowId") workflowId: string, @Body() body: any) {
    return this.svc.saveDraft(workflowId, body?.draft ?? body);
  }

  @Get("/:workflowId/draft")
  async getDraft(@Param("workflowId") workflowId: string) {
    return this.svc.getDraft(workflowId);
  }

  @Post("/:workflowId/publish")
  @HttpCode(200)
  async publish(@Param("workflowId") workflowId: string, @Body() body: any) {
    // force: 抢占 trigger
    return this.svc.publish(workflowId, body?.draft, { force: Boolean(body?.force) });
  }

  @Post("/:workflowId/activate")
  @HttpCode(200)
  async activate(@Param("workflowId") workflowId: string, @Body() body: any) {
    return this.svc.activate(workflowId, Number(body?.version));
  }

  @Post("/:workflowId/rollback")
  @HttpCode(200)
  async rollback(@Param("workflowId") workflowId: string, @Body() body: any) {
    return this.svc.rollback(workflowId, Number(body?.steps ?? 1));
  }

  @Get("/:workflowId/active")
  async active(@Param("workflowId") workflowId: string) {
    return this.svc.getActive(workflowId);
  }

  @Get("/:workflowId/releases")
  async releases(@Param("workflowId") workflowId: string) {
    return this.svc.listReleases(workflowId);
  }

  @Post("/:workflowId/run")
  @HttpCode(200)
  async run(@Param("workflowId") workflowId: string, @Body() body: any) {
    const env = { traceId: body?.traceId, tenantId: body?.tenantId, user: body?.user };
    return this.rt.runActive(workflowId, body ?? {}, env);
  }

  @Post("/:workflowId/replay")
  @HttpCode(200)
  async replay(@Param("workflowId") workflowId: string, @Query("sourceRunId") sourceRunId: string) {
    return this.rt.replayActive(workflowId, sourceRunId);
  }
}
