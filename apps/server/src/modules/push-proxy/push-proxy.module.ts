import { Module } from '@nestjs/common';
import { PushProxyService } from './push-proxy.service';

@Module({
  providers: [PushProxyService],
})
export class PushProxyModule {}
