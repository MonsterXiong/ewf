# Versioning Strategy

Goal: allow incremental evolution without breaking existing workflows.

## Workflow DSL

- `schemaVersion` is the DSL contract version.
- Backward compatible additions (new optional fields) => keep schemaVersion the same.
- Breaking changes (rename/remove/semantic changes) => bump schemaVersion (e.g. 1.0 -> 2.0).

## Node Types

- Node identity: `type + typeVersion`
- Backward compatible improvement inside same typeVersion:
  - only if semantics do not change and compiler output remains compatible.
- Breaking changes:
  - bump `typeVersion` and keep older version supported in registry.
- Registry should include both versions if old workflows exist.

## Connectors

- Connector identity: `connectorId`
- Operation identity: `operationId`
- If an operation’s request/response schema changes incompatibly:
  - introduce a new operationId (recommended), or
  - add `operationVersion` (optional future) while keeping operationId stable.
- Connector config schema changes should be backward compatible; otherwise bump connector registry schema or add config migrations.

## IR

- Runtime depends on IR OpSet version.
- Prefer: compiler emits only v1 ops for a long time; add new ops cautiously.
- When new ops are added:
  - runtime supports both old and new ops
  - compiler can target older ops by expansion rules when possible
