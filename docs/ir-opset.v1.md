# IR OpSet v1 (EWF)

This document freezes the runtime instruction set (IR). The runtime engine MUST only depend on IR, not on Workflow DSL nor registries.

## Core Goals

- Determinism: same inputs + same recorded replay data => same outputs
- Replay-safe: during replay, NO real external calls happen
- Plugin-extensible: add node types / connectors without changing runtime core

## Execution Model

- Program: linear array of instructions `program[]`
- Execution pointer: `pc` (program counter)
- State:
  - `ctx.env`: includes `__scopeId` and `__counters`
  - `ctx.vars`: mutable vars (with fork branch write guard)
  - `ctx.steps`: per-step status/output/errors
- Scoping:
  - main scopeId = "main"
  - fork branch scopeId = `fork:<forkId>:<branchName>`
- Counters:
  - `bumpCounter(ctx, "CALL", scopeId, stepId)` -> callIndex
  - `bumpCounter(ctx, "WAIT_RESUME", scopeId, stepId)` -> resumeIndex
  - Must be stable across replay

## Ops

### LABEL
- Fields: `{ op:"LABEL", name:string }`
- Behavior: no-op; label index is used by jumps.

### JUMP
- Fields: `{ op:"JUMP", to:string }`
- Behavior: set pc to label index.

### IF
- Fields: `{ op:"IF", cond:Value, then:string, else:string }`
- Behavior: evaluate `cond`; jump to `then` label if truthy else `else`.

### SET_VARS
- Fields: `{ op:"SET_VARS", set: Record<string, Value> }`
- Behavior: for each entry, evaluate Value, write into `ctx.vars` by path.
- Fork rule: in fork scope, writes to `vars.*` are forbidden except `vars.__branch.*`.

### MERGE
- Fields: `{ op:"MERGE", into:string, value:Value }`
- Behavior: evaluate value and assign into path in ctx.vars.
- Fork rule same as SET_VARS.

### APPEND
- Fields: `{ op:"APPEND", to:string, value:Value }`
- Behavior: evaluate value and push into array at target path.

### EVAL
- Fields: `{ op:"EVAL", id:string, output:Value }`
- Behavior: evaluate output, store into `ctx.steps[id]={status:"success", output}`.

### CALL
- Fields:
  - `{ op:"CALL", id:string, spec:{connectorId, operationId}, inputs:..., retry?, onError? }`
- Behavior:
  - Build request object (`params/query/headers/body`) from inputs mapping
  - Enforce egress policy allowlist (if provided)
  - Execute through CallExecutor which records replay data
  - Retry based on RetryPolicy (status-based by default)
  - On success: `ctx.steps[id]={status:"success", output}`
  - On fail:
    - if onError.mode=appendErrorAndContinue: append to `vars._errors` and continue
    - else mark run FAILED with `state.error`
- Determinism:
  - callIndex is derived from counters and scopeId
  - replay records key includes (runId, scopeId, stepId, callIndex, attemptIndex)

### WAIT
- Fields: `{ op:"WAIT", id:string, eventKey:Value }`
- Behavior:
  - Evaluate eventKey
  - Set `state.status="WAITING"` and `state.waiting={eventKey, waitStepId:id}`
  - Index waiting by eventKey in store (`waiting_index`)
- Resume:
  - Resume endpoint validates waiting eventKey match
  - Adds replay record kind=WAIT_RESUME with resumeIndex
  - Clears waiting_index entry for eventKey

### RETURN
- Fields: `{ op:"RETURN", output:Value }`
- Behavior: evaluate output; set `state.output` and `state.status="SUCCEEDED"`.

### FORK_ALL
- Fields:
  - `{ op:"FORK_ALL", id:string, branches:[{name,from,to}], join:string }`
- Behavior:
  - Record FORK_PLAN (branches list)
  - Execute each branch range in derived branch scopeId
  - After all settle, jump to join label
- Fork write guard:
  - Branch scopes may not write shared vars except `vars.__branch.*`

## Value Model

Value supports:
- literals
- refs (ctx.vars/ctx.steps/ctx.env)
- expressions (jsonata)

(Exact Value structure is defined in runtime/types and DSL schema ValueExpr.)

## Reserved Ops (v2+)

- TRY/CATCH/FINALLY scope ops
- FOREACH/WHILE structural ops (or compilation rules that expand into LABEL/IF/JUMP + fork)
- BREAK/CONTINUE
