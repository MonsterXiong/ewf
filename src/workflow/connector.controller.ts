import { Body, Controller, Get, HttpCode, Param, Put } from "@nestjs/common";
import { ConnectorConfigRepo } from "./connector-config.repo";

@Controller("/internal/connectors")
export class ConnectorController {
  constructor(private readonly repo: ConnectorConfigRepo) {}

  @Get("")
  async list() {
    // MVP：先返回静态 catalog；后续可以做成 DB/代码生成
    return [
      {
        connectorId: "conn_http",
        operations: ["request"],
        description: "HTTP connector (internal/external HTTP calls)",
      },
      {
        connectorId: "conn_db",
        operations: ["query", "execute"],
        description: "DB connector (stub)",
      },
      {
        connectorId: "conn_file",
        operations: ["upload", "download"],
        description: "File connector (stub)",
      },
      {
        connectorId: "conn_risk_service",
        operations: ["check"],
        description: "Risk service connector (stub)",
      },
    ];
  }

  @Get("/:connectorId/config")
  async getConfig(@Param("connectorId") connectorId: string) {
    return { connectorId, config: await this.repo.get(connectorId) };
  }

  @Put("/:connectorId/config")
  @HttpCode(200)
  async putConfig(@Param("connectorId") connectorId: string, @Body() body: any) {
    return this.repo.upsert(connectorId, body?.config ?? body);
  }
}
