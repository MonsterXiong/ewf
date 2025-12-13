import { NodeRegistry } from "../registry";
import { FlowReturnV1 } from "./flow.return";
import { FlowAwaitEventV1 } from "./flow.awaitEvent";
import { ConnCallV1 } from "./conn.call";
import { FlowIfV1 } from "./flow.if";
import { FlowForkV1 } from "./flow.fork";
import { FlowMergeV1 } from "./flow.merge";

export function createBuiltinRegistry() {
  return new NodeRegistry()
    .register(FlowReturnV1)
    .register(FlowAwaitEventV1)
    .register(ConnCallV1)
    .register(FlowIfV1)
    .register(FlowForkV1)
    .register(FlowMergeV1);
}
