import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { WorkflowRepo } from "./workflow.repo";
import { WorkflowRuntime } from "./workflow.runtime";

@Controller()
export class TriggerGatewayController {
  constructor(
    private readonly repo: WorkflowRepo,
    private readonly rt: WorkflowRuntime
  ) {}

  @All("/internal/api/*")
  async handle(@Req() req: Request, @Res() res: Response) {
    const method = String(req.method || "POST").toUpperCase();
    const path = req.path;

    const workflowId = await this.repo.findWorkflowIdByTrigger(method, path);
    if (!workflowId) {
      return res.status(404).json({ error: "TRIGGER_NOT_FOUND", method, path });
    }

    const input = method === "GET" ? (req.query ?? {}) : (req.body ?? {});
    const env = {
      traceId: (req.headers["x-trace-id"] as string) || undefined,
      tenantId: (req.headers["x-tenant-id"] as string) || undefined,
    };

    const run = await this.rt.runActive(workflowId, input, env);
    return res.status(200).json(run);
  }
}
