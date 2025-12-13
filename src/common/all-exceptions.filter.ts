import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";

type Mapped = { status: number; code: string };

function mapKnownErrorMessage(msg: string): Mapped | null {
  if (msg.startsWith("TRIGGER_CONFLICT")) return { status: 409, code: "TRIGGER_CONFLICT" };
  if (msg.startsWith("TRIGGER_PATH_FORBIDDEN")) return { status: 400, code: "TRIGGER_PATH_FORBIDDEN" };
  if (msg.startsWith("DRAFT_NOT_FOUND")) return { status: 404, code: "DRAFT_NOT_FOUND" };
  if (msg.startsWith("RELEASE_NOT_FOUND")) return { status: 404, code: "RELEASE_NOT_FOUND" };
  if (msg.startsWith("ACTIVE_NOT_FOUND")) return { status: 404, code: "ACTIVE_NOT_FOUND" };
  if (msg.startsWith("WAITING_RUN_NOT_FOUND")) return { status: 404, code: "WAITING_RUN_NOT_FOUND" };
  return null;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const debug = process.env.NODE_ENV === "test" || process.env.EWF_DEBUG_ERRORS === "1";

    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r: any = exception.getResponse();
      // Nest 默认 message 可能是 string / array / object
      const msg = typeof r === "string" ? r : r?.message ?? exception.message;
      message = Array.isArray(msg) ? msg.join("; ") : String(msg);
      code = r?.code ? String(r.code) : "HTTP_EXCEPTION";
    } else if (exception instanceof Error) {
      const msg = exception.message || "Internal server error";
      const mapped = mapKnownErrorMessage(msg);
      if (mapped) {
        status = mapped.status;
        code = mapped.code;
        message = msg; // 已知业务错误允许直接返回
      } else {
        // 未知错误：生产环境默认隐藏 message；测试环境暴露方便排障
        status = 500;
        code = "INTERNAL_ERROR";
        message = debug ? msg : "Internal server error";
      }
    } else {
      // 非 Error 类型异常
      status = 500;
      code = "INTERNAL_ERROR";
      message = debug ? String(exception) : "Internal server error";
    }

    res.status(status).json({
      statusCode: status,
      code,
      message,
      path: req.originalUrl || req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
