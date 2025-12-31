import { Body, Controller, Post } from '@nestjs/common';

import { SendPushNotificationReqBody } from './push-proxy.dto';
import { PushProxyService } from './push-proxy.service';

@Controller('push-proxy')
export class PushProxyController {
  constructor(private readonly pushProxyService: PushProxyService) {}

  @Post()
  async sendPushNotification(@Body() body: SendPushNotificationReqBody) {
    return this.pushProxyService.sendPushNotification(body);
  }
}
