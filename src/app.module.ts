import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { WorkflowModule } from "./workflow/workflow.module";
import { MockModule } from "./mock/mock.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";

@Module({
  imports: [WorkflowModule, MockModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
