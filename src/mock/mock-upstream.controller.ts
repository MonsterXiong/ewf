import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/mock/upstream")
export class MockUpstreamController {
  @Post("/echo")
  echo(@Body() body: any) {
    return { ok: true, received: body ?? null };
  }

  @Post("/delay")
  async delay(@Body() body: any) {
    const ms = Math.max(Number(body?.ms ?? 0) || 0, 0);
    await new Promise((r) => setTimeout(r, ms));
    return { ok: true, ms };
  }

  @Post("/fail")
  fail() {
    // 用于测试 if 分支：不该执行的分支如果执行就会让整个 run FAILED
    const err: any = new Error("mock fail");
    err.status = 500;
    throw err;
  }
}
