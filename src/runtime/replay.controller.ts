import { Body, Controller, Post, Param } from "@nestjs/common";
import { ReplayService } from "./replay.service";

@Controller()
export class ReplayController {
  constructor(private readonly replay: ReplayService) {}

  @Post("/runs/:runId/replay")
  async replayRecorded(@Param("runId") runId: string, @Body() body: any) {
    const ir = body?.ir;
    if (!ir) throw new Error("missing body.ir");
    const state = await this.replay.replayRecorded(ir, runId);
    return { runId: state.runId, status: state.status, output: state.output ?? null, error: state.error ?? null };
  }
}
