import { createHash } from "crypto";

export function stableStringify(obj: any): string {
  if (obj === null) return "null";

  const t = typeof obj;
  if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  if (t !== "object") {
    // undefined/function/symbol：JSON.stringify 会丢掉，这里按 null 处理避免不稳定
    return "null";
  }

  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();

  const body = keys
    .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
    .join(",");

  return "{" + body + "}";
}

export function sha256Hex(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
