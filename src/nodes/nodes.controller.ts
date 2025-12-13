import { Body, Controller, Get, Post } from "@nestjs/common";
import { NodesService } from "./nodes.service";

@Controller("/internal/nodes")
export class NodesController {
  constructor(private readonly svc: NodesService) {}

  @Get("/catalog")
  async catalog() {
    return this.svc.catalog();
  }

  @Post("/validate-draft")
  async validateDraft(@Body() draft: any) {
    // ✅ 保持 200 OK（Nest 默认也是 201 only for @Post with @HttpCode absent?）
    // 但为了绝对稳定，可在后续需要时加 @HttpCode(200)
    return this.svc.validateDraft(draft);
  }
}
