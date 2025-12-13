import { RunStore, ReplayRecord } from "./store";
import { RunState } from "./types";

export class InMemoryRunStore implements RunStore {
  private runs = new Map<string, RunState>();
  private waiting = new Map<string, string>();
  private records: ReplayRecord[] = [];

  async createRun(workflowId: string, workflowVersion: number, initial: RunState): Promise<string> {
    const runId = `run_${Math.random().toString(16).slice(2)}`;
    const s = { ...initial, runId, workflowId, workflowVersion };
    this.runs.set(runId, s);
    return runId;
  }

  async save(state: RunState): Promise<void> {
    this.runs.set(state.runId, JSON.parse(JSON.stringify(state)));
  }

  async load(runId: string): Promise<RunState | null> {
    const s = this.runs.get(runId);
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  async indexWaiting(eventKey: string, runId: string): Promise<void> {
    this.waiting.set(eventKey, runId);
  }

  async findWaiting(eventKey: string): Promise<string | null> {
    return this.waiting.get(eventKey) ?? null;
  }

  async clearWaiting(eventKey: string): Promise<void> {
    this.waiting.delete(eventKey);
  }

  async appendReplayRecord(rec: ReplayRecord): Promise<void> {
    this.records.push(JSON.parse(JSON.stringify(rec)));
  }

  async getCallRecord(runId: string, scopeId: string, stepId: string, callIndex: number, attemptIndex: number) {
    return (
      this.records.find(
        (r: any) =>
          r.kind === "CALL" &&
          r.runId === runId &&
          r.scopeId === scopeId &&
          r.stepId === stepId &&
          r.callIndex === callIndex &&
          r.attemptIndex === attemptIndex
      ) ?? null
    );
  }

  async getWaitRecord(runId: string, scopeId: string, stepId: string, resumeIndex: number) {
    return (
      this.records.find(
        (r: any) =>
          r.kind === "WAIT_RESUME" &&
          r.runId === runId &&
          r.scopeId === scopeId &&
          r.stepId === stepId &&
          r.resumeIndex === resumeIndex
      ) ?? null
    );
  }
}
