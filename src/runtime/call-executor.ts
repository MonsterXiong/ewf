import { RunStore } from "./store";
import { getScopeId } from "./value";

export type CallExecArgs = {
  runId: string;
  stepId: string;
  callIndex: number;
  attemptIndex: number;
  spec: any;
  req: any;
  ctx: any;
  invoke: () => Promise<any>;
};

export interface CallExecutor {
  exec(args: CallExecArgs): Promise<any>;
}

export class RealCallExecutor implements CallExecutor {
  async exec(args: CallExecArgs): Promise<any> {
    return args.invoke();
  }
}

export class RecordingCallExecutor implements CallExecutor {
  constructor(private readonly store: RunStore, private readonly inner: CallExecutor = new RealCallExecutor()) {}

  async exec(args: CallExecArgs): Promise<any> {
    const scopeId = getScopeId(args.ctx);
    try {
      const res = await this.inner.exec(args);
      await this.store.appendReplayRecord({
        kind: "CALL",
        runId: args.runId,
        scopeId,
        stepId: args.stepId,
        callIndex: args.callIndex,
        attemptIndex: args.attemptIndex,
        spec: args.spec,
        req: args.req,
        outcome: { ok: true, response: res },
        recordedAt: Date.now(),
      } as any);
      return res;
    } catch (e: any) {
      await this.store.appendReplayRecord({
        kind: "CALL",
        runId: args.runId,
        scopeId,
        stepId: args.stepId,
        callIndex: args.callIndex,
        attemptIndex: args.attemptIndex,
        spec: args.spec,
        req: args.req,
        outcome: { ok: false, error: { message: e?.message, status: e?.status, kind: e?.kind, body: e?.body } },
        recordedAt: Date.now(),
      } as any);
      throw e;
    }
  }
}

export class ReplayCallExecutor implements CallExecutor {
  constructor(private readonly store: RunStore, private readonly sourceRunId: string) {}

  async exec(args: CallExecArgs): Promise<any> {
    const scopeId = getScopeId(args.ctx);
    const rec = await this.store.getCallRecord(this.sourceRunId, scopeId, args.stepId, args.callIndex, args.attemptIndex);
    if (!rec || rec.kind !== "CALL") throw new Error(`REPLAY_CALL_RECORD_NOT_FOUND stepId=${args.stepId} callIndex=${args.callIndex} attempt=${args.attemptIndex} scope=${scopeId}`);
    const outcome = (rec as any).outcome;
    if (outcome.ok) return outcome.response;
    const err: any = new Error(outcome.error?.message || "replayed error");
    err.kind = outcome.error?.kind;
    err.status = outcome.error?.status;
    err.body = outcome.error?.body;
    throw err;
  }
}
