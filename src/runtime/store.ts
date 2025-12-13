import { RunState } from "./types";

export type ReplayRecord =
  | {
      kind: "CALL";
      runId: string;
      scopeId: string;
      stepId: string;
      callIndex: number;
      attemptIndex: number;
      spec: any;
      req: any;
      outcome: any;
      recordedAt: number;
    }
  | {
      kind: "WAIT_RESUME";
      runId: string;
      scopeId: string;
      stepId: string;
      resumeIndex: number;
      payload: any;
      recordedAt: number;
    }
  | {
      kind: "FORK_PLAN";
      runId: string;
      scopeId: string;
      forkId: string;
      branches: string[];
      recordedAt: number;
    };

export interface RunStore {
  createRun(workflowId: string, workflowVersion: number, initial: RunState): Promise<string>;
  save(state: RunState): Promise<void>;
  load(runId: string): Promise<RunState | null>;

  indexWaiting(eventKey: string, runId: string): Promise<void>;
  findWaiting(eventKey: string): Promise<string | null>;
  clearWaiting(eventKey: string): Promise<void>;

  appendReplayRecord(rec: ReplayRecord): Promise<void>;

  getCallRecord(runId: string, scopeId: string, stepId: string, callIndex: number, attemptIndex: number): Promise<any | null>;
  getWaitRecord(runId: string, scopeId: string, stepId: string, resumeIndex: number): Promise<any | null>;
}
