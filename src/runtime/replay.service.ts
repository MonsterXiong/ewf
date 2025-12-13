import { Injectable, Inject } from "@nestjs/common";
import { RunStore } from "./store";
import { IrInterpreter } from "./interpreter";
import { ReplayCallExecutor } from "./call-executor";

@Injectable()
export class ReplayService {
  constructor(@Inject("RunStore") private readonly store: RunStore) {}

  async replayRecorded(ir: any, sourceRunId: string) {
    const src = await this.store.load(sourceRunId);
    if (!src) throw new Error("RUN_NOT_FOUND");

    const input = src.ctx?.vars?.__input;
    if (!input) throw new Error("SOURCE_INPUT_NOT_FOUND vars.__input");

    const env = { ...(src.ctx?.env ?? {}) };

    // ✅ replay 运行必须从干净的计数器开始，否则 CALL/WAIT 的 index 会偏移
    (env as any).__counters = {};
    (env as any).__scopeId = "main";

    delete (env as any).runId;
    (env as any).replayOfRunId = sourceRunId;


    const executor = new ReplayCallExecutor(this.store, sourceRunId);
    const it = new IrInterpreter(ir, this.store, {}, executor);

    let state = await it.start(JSON.parse(JSON.stringify(input)), env);

    // auto resume WAIT using recorded payloads
    while (state.status === "WAITING" && state.waiting) {
      const scopeId = state.ctx.env.__scopeId ?? "main";
      const stepId = state.waiting.waitStepId;
      const resumeIndex = state.ctx.env.__counters?.[`WAIT_RESUME:${scopeId}:${stepId}`] ?? 0;
      const rec = await this.store.getWaitRecord(sourceRunId, scopeId, stepId, resumeIndex);
      if (!rec || rec.kind !== "WAIT_RESUME") throw new Error(`REPLAY_WAIT_RECORD_NOT_FOUND stepId=${stepId} resumeIndex=${resumeIndex}`);
      state = await it.resume(state.runId, state.waiting.eventKey, (rec as any).payload);
    }

    return state;
  }
}
