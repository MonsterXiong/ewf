import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { EventService } from "./event.service";

@Controller("/internal/events")
export class EventController {
  constructor(private readonly svc: EventService) {}

  @Post("/emit")
  @HttpCode(200)
  async emit(@Body() body: any) {
    return this.svc.emit(String(body?.eventKey || ""), body?.payload);
  }
}
