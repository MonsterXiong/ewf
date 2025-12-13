type Resp<T> = { status: number; headers: Record<string, string>; body: T };

function splitLines(csv: string) {
  return csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((x) => x.trim().length > 0);
}

export class ConnFileClient {
  async ParseCsv(req: { body: { csv: string } }): Promise<Resp<{ rows: any[] }>> {
    const csv = req?.body?.csv ?? "";
    const lines = splitLines(csv);
    if (lines.length === 0) return { status: 200, headers: {}, body: { rows: [] } };

    const headers = lines[0].split(",").map((s) => s.trim());
    const rows = lines.slice(1).map((ln) => {
      const cols = ln.split(",").map((s) => s.trim());
      const obj: any = {};
      headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
      return obj;
    });

    return { status: 200, headers: {}, body: { rows } };
  }

  async GenerateCsv(req: { body: { rows: any[] } }): Promise<Resp<{ csv: string }>> {
    const rows = req?.body?.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return { status: 200, headers: {}, body: { csv: "" } };

    const keys = Object.keys(rows[0]);
    const header = keys.join(",");
    const lines = rows.map((r) => keys.map((k) => String(r?.[k] ?? "")).join(","));
    const csv = [header, ...lines].join("\n");

    return { status: 200, headers: {}, body: { csv } };
  }
}
