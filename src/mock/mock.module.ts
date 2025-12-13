import { Module } from "@nestjs/common";
import { MockUpstreamController } from "./mock-upstream.controller";

@Module({
  controllers: [MockUpstreamController],
})
export class MockModule {}
