import { Injectable, OnModuleDestroy } from "@nestjs/common";
import mysql from "mysql2/promise";
import { createMySqlPoolFromEnv } from "../runtime/mysql.pool";

@Injectable()
export class MySqlPoolProvider implements OnModuleDestroy {
  readonly pool: mysql.Pool;

  constructor() {
    this.pool = createMySqlPoolFromEnv();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
