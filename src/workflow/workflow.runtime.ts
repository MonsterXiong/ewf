import { IrInterpreter } from "../runtime/interpreter";
import { CallExecutor } from "../runtime/call-executor";
import { RunStore } from "../runtime/store";
import { WorkflowRepo } from "./workflow.repo";
import { ReplayService } from "../runtime/replay.service";

export class WorkflowRuntime {
  constructor(
    private readonly repo: WorkflowRepo,
    private readonly store: RunStore,
    private readonly callExecutor: CallExecutor,
    private readonly clients: Record<string, any>,
  ) {}

  async runActive(workflowId: string, input: any, env?: any) {
    const active = await this.repo.getActiveIr(workflowId);
    if (!active) throw new Error(`ACTIVE_NOT_FOUND workflowId=${workflowId}`);
    const it = new IrInterpreter(active.ir, this.store as any, this.clients, this.callExecutor);
    return it.start(input ?? {}, env ?? {});
  }

  async replayActive(workflowId: string, sourceRunId: string) {
    const active = await this.repo.getActiveIr(workflowId);
    if (!active) throw new Error(`ACTIVE_NOT_FOUND workflowId=${workflowId}`);
    const replaySvc = new ReplayService(this.store as any);
    return replaySvc.replayRecorded(active.ir, sourceRunId);
  }
}
