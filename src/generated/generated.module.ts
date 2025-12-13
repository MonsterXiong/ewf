import { Module } from "@nestjs/common";
import { GeneratedControllers } from "./generated.index";
import { GeneratedProviders } from "./generated.providers";

@Module({
  controllers: [...GeneratedControllers],
  providers: [...GeneratedProviders],
  exports: [...GeneratedProviders],
})
export class GeneratedModule {}
