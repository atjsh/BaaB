import { Module } from '@nestjs/common';

import { PushProxyController } from './push-proxy.controller';
import { PushProxyService } from './push-proxy.service';

@Module({
  controllers: [PushProxyController],
  providers: [PushProxyService],
})
export class PushProxyModule {}
