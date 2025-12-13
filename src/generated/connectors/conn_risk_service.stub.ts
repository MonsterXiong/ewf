type Resp<T> = { status: number; headers: Record<string,string>; body: T };

export class ConnRiskServiceClient {
  private attemptsById = new Map<string, number>();

  async GetRisk(req: { body: { id: string } }): Promise<Resp<any>> {
    const id = req?.body?.id ?? "unknown";
    const cur = this.attemptsById.get(id) ?? 0;
    this.attemptsById.set(id, cur + 1);

    // 前两次失败（503），第三次成功
    if (cur < 2) {
      const e: any = new Error("temporary unavailable");
      e.kind = "ConnectorError";
      e.status = 503;
      throw e;
    }

    return { status: 200, headers: {}, body: { id, score: 0.9, attemptsUsed: cur + 1 } };
  }
}
