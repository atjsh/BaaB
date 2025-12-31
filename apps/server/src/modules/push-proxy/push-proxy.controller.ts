import { Controller, Post, Body } from '@nestjs/common';

import { PushProxyService } from './push-proxy.service';

@Controller('push-proxy')
export class PushProxyController {
  constructor(private readonly pushProxyService: PushProxyService) {}
}
