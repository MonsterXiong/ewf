import { RunStore } from "./store";
import { RunState, Value } from "./types";
import { CallExecutor, RealCallExecutor } from "./call-executor";
import { applyInput, bumpCounter, evalValue, getScopeId } from "./value";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setByPath(obj: any, path: string, val: any) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = val;
}

function getByPath(obj: any, path: string) {
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export class IrInterpreter {
  private labelToPc = new Map<string, number>();

  constructor(
    private readonly ir: any,
    private readonly store: RunStore,
    private readonly clients: Record<string, any>,
    private readonly callExecutor: CallExecutor = new RealCallExecutor(),
  ) {
    this.indexLabels();
  }

  private indexLabels() {
    const p = this.ir.program ?? [];
    for (let i = 0; i < p.length; i++) {
      if (p[i].op === "LABEL") this.labelToPc.set(p[i].name, i);
    }
  }

  private pcOfLabel(name: string) {
    const pc = this.labelToPc.get(name);
    if (pc == null) throw new Error(`label not found: ${name}`);
    return pc;
  }
  private pcAfterLabel(name: string) { return this.pcOfLabel(name) + 1; }

  async start(input: any, env?: any): Promise<RunState> {
    const firstLabelIdx = (this.ir.program ?? []).findIndex((x: any) => x.op === "LABEL");
    if (firstLabelIdx < 0) throw new Error("IR has no LABEL");

    const initial: RunState = {
      runId: "temp",
      workflowId: this.ir.workflowId,
      workflowVersion: this.ir.workflowVersion ?? 1,
      status: "RUNNING",
      pc: firstLabelIdx + 1,
      ctx: {
        env: { __scopeId: "main", __counters: {}, ...(env ?? {}) },
        vars: { ...input, __input: JSON.parse(JSON.stringify(input)), __branch: {}, _errors: [] },
        steps: {}
      }
    };

    const runId = await this.store.createRun(initial.workflowId, initial.workflowVersion, initial);
    initial.runId = runId;
    initial.ctx.env.runId = runId;

    await this.store.save(initial);
    return this.runUntilStop(initial);
  }

  async resume(runId: string, eventKey: string, payload: any): Promise<RunState> {
    const state = await this.store.load(runId);
    if (!state) throw new Error("RUN_NOT_FOUND");
    if (state.status !== "WAITING" || !state.waiting) throw new Error("RUN_NOT_WAITING");
    if (state.waiting.eventKey !== eventKey) throw new Error("EVENT_KEY_MISMATCH");

    const scopeId = getScopeId(state.ctx);
    const resumeIndex = bumpCounter(state.ctx, "WAIT_RESUME", scopeId, state.waiting.waitStepId);

    await this.store.appendReplayRecord({
      kind: "WAIT_RESUME",
      runId,
      scopeId,
      stepId: state.waiting.waitStepId,
      resumeIndex,
      payload,
      recordedAt: Date.now()
    } as any);

    state.ctx.steps[state.waiting.waitStepId] = { status: "success", output: payload };
    state.waiting = undefined;
    state.status = "RUNNING";

    // ✅ resume 后清理 waiting_index（重要）
    await this.store.clearWaiting(eventKey);

    await this.store.save(state);
    return this.runUntilStop(state);
  }

  private async runUntilStop(state: RunState): Promise<RunState> {
    const prog = this.ir.program ?? [];
    while (state.status === "RUNNING" && state.pc >= 0 && state.pc < prog.length) {
      const ins = prog[state.pc];
      state.pc = await this.execOne(state, state.pc, ins, state.ctx);
      await this.store.save(state);
    }
    return state;
  }

  private async runRangeScoped(state: RunState, startPc: number, endPcExclusive: number, scopeId: string) {
    const baseEnv = state.ctx.env ?? {};
    const branchEnv = { ...baseEnv, __scopeId: scopeId, __counters: baseEnv.__counters ?? {} };
    const branchCtx = { env: branchEnv, vars: state.ctx.vars, steps: state.ctx.steps };

    let pc = startPc;
    const prog = this.ir.program ?? [];
    while (state.status === "RUNNING" && pc < endPcExclusive) {
      pc = await this.execOne(state, pc, prog[pc], branchCtx);
    }
  }

  private assertBranchVarsWriteAllowed(target: string, ctx: any) {
    const scope = ctx?.env?.__scopeId ?? "main";
    if (!String(scope).startsWith("fork:")) return;
    if (target.startsWith("vars.") && !target.startsWith("vars.__branch.")) {
      throw new Error(`FORK_SCOPE_WRITE_VARS_FORBIDDEN target=${target} scope=${scope}`);
    }
  }

  private shouldRetry(err: any, retry: any) {
    const status = err?.status;
    const list = retry?.retryOnStatus ?? [429, 500, 502, 503, 504];
    return typeof status === "number" && list.includes(status);
  }

  private async execOne(state: RunState, pc: number, ins: any, ctx: any): Promise<number> {
    switch (ins.op) {
      case "LABEL": return pc + 1;
      case "JUMP": return this.pcOfLabel(ins.to);

      case "IF": {
        const cond = await evalValue(ins.cond as Value, ctx);
        return cond ? this.pcOfLabel(ins.then) : this.pcOfLabel(ins.else);
      }

      case "SET_VARS": {
        for (const [k, v] of Object.entries(ins.set ?? {})) {
          this.assertBranchVarsWriteAllowed(String(k), ctx);
          const path = String(k).replace(/^vars\./, "");
          const val = await evalValue(v as any, ctx);
          setByPath(ctx.vars, path, val);
        }
        return pc + 1;
      }

      case "MERGE": {
        this.assertBranchVarsWriteAllowed(String(ins.into), ctx);
        const path = String(ins.into).replace(/^vars\./, "");
        const val = await evalValue(ins.value, ctx);
        setByPath(ctx.vars, path, val);
        return pc + 1;
      }

      case "APPEND": {
        this.assertBranchVarsWriteAllowed(String(ins.to), ctx);
        const path = String(ins.to).replace(/^vars\./, "");
        const val = await evalValue(ins.value, ctx);
        const arr = getByPath(ctx.vars, path) ?? [];
        if (!Array.isArray(arr)) throw new Error(`APPEND target not array: ${ins.to}`);
        arr.push(val);
        setByPath(ctx.vars, path, arr);
        return pc + 1;
      }

      case "EVAL": {
        ctx.steps[ins.id] = { status: "success", output: await evalValue(ins.output, ctx) };
        return pc + 1;
      }

      case "WAIT": {
        const eventKey = await evalValue(ins.eventKey, ctx);
        state.status = "WAITING";
        state.waiting = { eventKey, waitStepId: ins.id };

        await this.store.indexWaiting(eventKey, state.runId);
        return pc + 1;
      }

      case "RETURN": {
        state.output = await evalValue(ins.output, ctx);
        state.status = "SUCCEEDED";
        return pc + 1;
      }

      case "FORK_ALL": {
        const forkId = ins.id;
        const scopeId = getScopeId(ctx);

        await this.store.appendReplayRecord({
          kind: "FORK_PLAN",
          runId: state.runId,
          scopeId,
          forkId,
          branches: (ins.branches ?? []).map((b: any) => b.name),
          recordedAt: Date.now()
        } as any);

        const branches = ins.branches ?? [];
        await Promise.all(branches.map(async (b: any) => {
          const branchScope = `fork:${forkId}:${b.name}`;
          const start = this.pcAfterLabel(b.from);
          const end = this.pcOfLabel(b.to);
          await this.runRangeScoped(state, start, end, branchScope);
        }));

        return this.pcOfLabel(ins.join);
      }

      case "CALL": {
        const req: any = { params: {}, query: {}, headers: {}, body: undefined };

        const inputsObj = ins.inputs ?? {};
        if (inputsObj.body || inputsObj["params.id"] || inputsObj["query.x"] || inputsObj["headers.x"]) {
          for (const [k, vv] of Object.entries(inputsObj)) {
            const val = await evalValue(vv as any, ctx);
            applyInput(req, k, val);
          }
        } else {
          const evaluated = await evalValue(inputsObj as any, ctx);
          if (evaluated && typeof evaluated === "object" && !Array.isArray(evaluated)) {
            if (evaluated.params && typeof evaluated.params === "object") Object.assign(req.params, evaluated.params);
            if (evaluated.query && typeof evaluated.query === "object") Object.assign(req.query, evaluated.query);
            if (evaluated.headers && typeof evaluated.headers === "object") Object.assign(req.headers, evaluated.headers);
            if ("body" in evaluated) req.body = evaluated.body;
            else req.body = evaluated;
          } else {
            req.body = evaluated;
          }
        }

        const spec = ins.spec;
        const onError = ins.onError;
        const retry = ins.retry;

        // ✅ egress allowlist enforcement
        const allow = this.ir?.policies?.egress?.allowConnectors;
        if (Array.isArray(allow) && allow.length > 0) {
          if (!allow.includes(spec.connectorId)) {
            throw new Error(`EGRESS_DENIED connectorId=${spec.connectorId}`);
          }
        }

        const scopeId = getScopeId(ctx);
        const callIndex = bumpCounter(ctx, "CALL", scopeId, ins.id);

        const maxAttempts = retry?.maxAttempts ?? 1;
        const backoffMs = retry?.backoffMs ?? 0;
        const mult = retry?.backoffMultiplier ?? 1;

        let lastErr: any = null;
        let delay = backoffMs;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const res = await this.callExecutor.exec({
              runId: state.runId,
              stepId: ins.id,
              callIndex,
              attemptIndex: attempt,
              spec,
              req,
              ctx,
              invoke: async () => {
                const client = this.clients[spec.connectorId];
                if (!client) throw new Error(`CONNECTOR_NOT_FOUND ${spec.connectorId}`);
                const fn = client[spec.operationId];
                if (typeof fn !== "function") throw new Error(`OP_NOT_FOUND ${spec.operationId}`);
                return fn.call(client, req);
              }
            });
            ctx.steps[ins.id] = { status: "success", output: res };
            return pc + 1;
          } catch (e: any) {
            lastErr = e;
            const canRetry = attempt < maxAttempts - 1 && this.shouldRetry(e, retry);
            if (!canRetry) break;
            if (delay > 0) await sleep(delay);
            delay = Math.floor(delay * mult);
          }
        }

        ctx.steps[ins.id] = { status: "fail", error: { message: lastErr?.message, status: lastErr?.status } };

        if (onError?.mode === "appendErrorAndContinue") {
          ctx.vars._errors.push({ stepId: ins.id, error: { message: lastErr?.message, status: lastErr?.status } });
          return pc + 1;
        }

        state.error = { stepId: ins.id, message: lastErr?.message, status: lastErr?.status };
        state.status = "FAILED";
        return pc + 1;
      }

      default:
        throw new Error(`unsupported op: ${ins.op}`);
    }
  }
}
