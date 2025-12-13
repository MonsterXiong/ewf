import { Controller, Get, Param, Query } from "@nestjs/common";
import { AuditRepo } from "./audit.repo";

@Controller("/internal/audit")
export class AuditController {
  constructor(private readonly repo: AuditRepo) {}

  @Get("/runs")
  async listRuns(
    @Query("workflowId") workflowId?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.repo.listRuns({ workflowId, status, limit: Number(limit), offset: Number(offset) });
  }

  @Get("/runs/:runId")
  async getRun(@Param("runId") runId: string) {
    const r = await this.repo.getRun(runId);
    if (!r) return { error: "RUN_NOT_FOUND", runId };
    return r;
  }

  @Get("/replay-records")
  async listReplay(
    @Query("runId") runId: string,
    @Query("kind") kind?: string,
    @Query("stepId") stepId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.repo.listReplayRecords(runId, { kind, stepId, limit: Number(limit), offset: Number(offset) });
  }
}
