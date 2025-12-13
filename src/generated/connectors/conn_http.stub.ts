import { Injectable } from "@nestjs/common";
import { ConnectorConfigRepo } from "../../workflow/connector-config.repo";

type HttpPayload = {
  method?: string;
  path?: string; // "/internal/mock/xxx" or full url
  headers?: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
  timeoutMs?: number;
};

function toStr(v: any) {
  return v == null ? "" : String(v);
}
function ensureNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ${env.KEY}
function interpolateEnv(str: string) {
  return str.replace(/\$\{env\.([A-Z0-9_]+)\}/g, (_m, k) => String(process.env[k] ?? ""));
}

function deepInterpolateEnv<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return interpolateEnv(v) as any;
  if (Array.isArray(v)) return v.map((x) => deepInterpolateEnv(x)) as any;
  if (typeof v === "object") {
    const o: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      o[k] = deepInterpolateEnv(val);
    }
    return o;
  }
  return v;
}

@Injectable()
export class ConnHttpClient {
  constructor(private readonly cfgRepo: ConnectorConfigRepo) {}

  private async resolveConfig() {
    const raw = (await this.cfgRepo.get("conn_http")) ?? {};
    const cfg = deepInterpolateEnv(raw);

    const baseUrl =
      cfg.baseUrl ??
      process.env.EWF_HTTP_BASE_URL ??
      "http://127.0.0.1:3000";

    const timeoutMs = ensureNumber(cfg.timeoutMs ?? process.env.EWF_HTTP_TIMEOUT_MS, 5000);

    const defaultHeaders =
      cfg.defaultHeaders && typeof cfg.defaultHeaders === "object" ? cfg.defaultHeaders : {};

    return { baseUrl: String(baseUrl), timeoutMs, defaultHeaders };
  }

  async request(req: any) {
    const { baseUrl, timeoutMs: cfgTimeout, defaultHeaders } = await this.resolveConfig();

    const payload: HttpPayload = req?.body && typeof req.body === "object" ? req.body : {};
    const method = toStr(payload.method || "GET").toUpperCase();
    const path = toStr(payload.path || "/");

    const headers: Record<string, any> = {
      ...defaultHeaders,
      ...(payload.headers ?? {}),
      ...(req?.headers ?? {}),
    };

    const query: Record<string, any> = {
      ...(payload.query ?? {}),
      ...(req?.query ?? {}),
    };

    const body = payload.body;

    const url =
      path.startsWith("http://") || path.startsWith("https://")
        ? new URL(path)
        : new URL(path, baseUrl);

    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timeoutMs = ensureNumber(payload.timeoutMs, cfgTimeout);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let fetchBody: any = undefined;
      if (body !== undefined) {
        if (!headers["content-type"] && !headers["Content-Type"]) {
          headers["content-type"] = "application/json";
        }
        const ct = String(headers["content-type"] || headers["Content-Type"] || "");
        fetchBody = ct.includes("application/json") ? JSON.stringify(body) : body;
      }

      const resp = await fetch(url.toString(), {
        method,
        headers,
        body: fetchBody,
        signal: controller.signal,
      });

      const contentType = resp.headers.get("content-type") || "";
      const text = await resp.text();
      const parsed = contentType.includes("application/json") && text ? JSON.parse(text) : text;

      if (resp.status >= 400) {
        const err: any = new Error(`HTTP_${resp.status} ${method} ${url.pathname}`);
        err.code = `HTTP_${resp.status}`;
        err.status = resp.status;
        err.details = parsed;
        throw err;
      }

      return parsed;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        const err: any = new Error(`HTTP_TIMEOUT ${method} ${url.pathname} timeoutMs=${timeoutMs}`);
        err.code = "HTTP_TIMEOUT";
        err.status = 504;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}
