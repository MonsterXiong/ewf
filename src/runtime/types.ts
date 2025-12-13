export type Value =
  | { const: any }
  | { ref: string }
  | { expr: { lang: "jsonata"; body: string } }
  | { secretRef: { key: string } };

export type RunStatus = "RUNNING" | "WAITING" | "SUCCEEDED" | "FAILED";

export type RunState = {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  status: RunStatus;
  pc: number;
  ctx: {
    env: any;
    vars: any;
    steps: Record<string, any>;
  };
  waiting?: { eventKey: string; waitStepId: string };
  output?: any;
  error?: any;
};
