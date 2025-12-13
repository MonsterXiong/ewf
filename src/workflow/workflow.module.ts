import { Module } from "@nestjs/common";
import { GeneratedModule } from "../generated/generated.module";

import { WorkflowController } from "./workflow.controller";
import { TriggerGatewayController } from "./trigger.gateway.controller";
import { EventController } from "./event.controller";
import { AuditController } from "./audit.controller";
import { ConnectorController } from "./connector.controller";
import { NodeCatalogController } from "./node-catalog.controller";

import { WorkflowRepo } from "./workflow.repo";
import { CompilerBridge } from "./compiler.bridge";
import { WorkflowService } from "./workflow.service";
import { WorkflowRuntime } from "./workflow.runtime";

import { ConnDbClient } from "../generated/connectors/conn_db.stub";
import { ConnFileClient } from "../generated/connectors/conn_file.stub";
import { ConnRiskServiceClient } from "../generated/connectors/conn_risk_service.stub";
import { ConnHttpClient } from "../generated/connectors/conn_http.stub";

import { MySqlPoolProvider } from "./mysql-pool.provider";
import { EventService } from "./event.service";
import { AuditRepo } from "./audit.repo";
import { ConnectorConfigRepo } from "./connector-config.repo";
import { PluginCompilerService } from "./compiler.plugin.service";
import { DraftValidationService } from "./draft-validation.service";
import { DraftDefaultsService } from "./draft-defaults.service";
import { DraftNormalizeService } from "./draft-normalize.service";

@Module({
  imports: [GeneratedModule],
  controllers: [
    WorkflowController,
    EventController,
    AuditController,
    ConnectorController,
    NodeCatalogController,
    TriggerGatewayController,
  ],
  providers: [
    MySqlPoolProvider,

    {
      provide: WorkflowRepo,
      useFactory: (p: MySqlPoolProvider) => new WorkflowRepo(p.pool),
      inject: [MySqlPoolProvider],
    },
    {
      provide: AuditRepo,
      useFactory: (p: MySqlPoolProvider) => new AuditRepo(p.pool),
      inject: [MySqlPoolProvider],
    },
    {
      provide: ConnectorConfigRepo,
      useFactory: (p: MySqlPoolProvider) => new ConnectorConfigRepo(p.pool),
      inject: [MySqlPoolProvider],
    },

    { provide: CompilerBridge, useFactory: () => new CompilerBridge() },
    PluginCompilerService,
    DraftValidationService,
    DraftDefaultsService,
    DraftNormalizeService, // ✅ 新增

    {
      provide: WorkflowService,
      useFactory: (repo: WorkflowRepo, compiler: CompilerBridge, pcs: PluginCompilerService) =>
        new WorkflowService(repo, compiler, pcs),
      inject: [WorkflowRepo, CompilerBridge, PluginCompilerService],
    },

    ConnDbClient,
    ConnFileClient,
    ConnRiskServiceClient,
    ConnHttpClient,

    {
      provide: WorkflowRuntime,
      useFactory: (
        repo: WorkflowRepo,
        store: any,
        callExecutor: any,
        db: ConnDbClient,
        file: ConnFileClient,
        risk: ConnRiskServiceClient,
        http: ConnHttpClient
      ) =>
        new WorkflowRuntime(repo, store, callExecutor, {
          conn_db: db,
          conn_file: file,
          conn_risk_service: risk,
          conn_http: http,
        }),
      inject: [WorkflowRepo, "RunStore", "CallExecutor", ConnDbClient, ConnFileClient, ConnRiskServiceClient, ConnHttpClient],
    },

    {
      provide: EventService,
      useFactory: (
        repo: WorkflowRepo,
        store: any,
        callExecutor: any,
        db: ConnDbClient,
        file: ConnFileClient,
        risk: ConnRiskServiceClient,
        http: ConnHttpClient
      ) =>
        new EventService(repo, store, callExecutor, {
          conn_db: db,
          conn_file: file,
          conn_risk_service: risk,
          conn_http: http,
        }),
      inject: [WorkflowRepo, "RunStore", "CallExecutor", ConnDbClient, ConnFileClient, ConnRiskServiceClient, ConnHttpClient],
    },
  ],
})
export class WorkflowModule {}
