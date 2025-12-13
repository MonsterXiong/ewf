import { Module } from "@nestjs/common";
import { NodesController } from "./nodes.controller";
import { NodesService } from "./nodes.service";
import { SchemaValidationService } from "../common/schema-validation.service";

@Module({
  controllers: [NodesController],
  providers: [NodesService, SchemaValidationService],
  exports: [NodesService]
})
export class NodesModule {}
