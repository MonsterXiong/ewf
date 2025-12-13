import { RunStore } from "../runtime/store";
import { CallExecutor } from "../runtime/call-executor";
import { IrInterpreter } from "../runtime/interpreter";
import { WorkflowRepo } from "./workflow.repo";

export class EventService {
  constructor(
    private readonly repo: WorkflowRepo,
    private readonly store: RunStore,
    private readonly callExecutor: CallExecutor,
    private readonly clients: Record<string, any>,
  ) {}

  async emit(eventKey: string, payload: any) {
    const runId = await this.store.findWaiting(eventKey);
    if (!runId) throw new Error(`WAITING_RUN_NOT_FOUND eventKey=${eventKey}`);

    const state = await this.store.load(runId);
    if (!state) throw new Error(`RUN_NOT_FOUND runId=${runId}`);

    // 用 run 自己的 workflowVersion（保证一致）
    const rel = await this.repo.getRelease(state.workflowId, state.workflowVersion);
    if (!rel) throw new Error(`RELEASE_NOT_FOUND workflowId=${state.workflowId} version=${state.workflowVersion}`);

    const it = new IrInterpreter(rel.ir, this.store, this.clients, this.callExecutor);
    return it.resume(runId, eventKey, payload);
  }
}
