import { Body, Controller, Get, Post, HttpCode } from "@nestjs/common";
import { PluginCompilerService } from "./compiler.plugin.service";
import { DraftValidationService } from "./draft-validation.service";
import { DraftDefaultsService } from "./draft-defaults.service";
import { DraftNormalizeService } from "./draft-normalize.service";

@Controller("/internal/nodes")
export class NodeCatalogController {
  constructor(
    private readonly pcs: PluginCompilerService,
    private readonly dvs: DraftValidationService,
    private readonly dds: DraftDefaultsService,
    private readonly dns: DraftNormalizeService
  ) {}

  @Get("/catalog")
  catalog() {
    return this.pcs.catalog();
  }

  @Post("/validate-draft")
  @HttpCode(200)
  validateDraft(@Body() draft: any) {
    return this.dvs.validateDraft(draft);
  }

  @Post("/apply-defaults")
  @HttpCode(200)
  applyDefaults(@Body() draft: any) {
    return this.dds.applyDefaults(draft);
  }

  @Post("/normalize-draft")
  @HttpCode(200)
  normalizeDraft(@Body() draft: any) {
    return this.dns.normalizeDraft(draft);
  }
}
