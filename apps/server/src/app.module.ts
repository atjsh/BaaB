import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProcessConfigFactory } from './config/process.config';
import { PushServiceWhitelistConfigFactory } from './config/push-service-whitelist.config';

import { PushProxyModule } from './modules/push-proxy/push-proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [ProcessConfigFactory, PushServiceWhitelistConfigFactory],
    }),
    PushProxyModule,
  ],
})
export class AppModule {}
