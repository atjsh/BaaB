import { registerAs } from '@nestjs/config';

import { expectPropertyExists } from '../typescript/expect';

export const PushServiceWhitelistConfigFactory = registerAs(
  Symbol.for('push-service-whitelist-config'),
  () =>
    ({
      allowedNotificationServiceUrls: expectPropertyExists(process.env, 'ALLOWED_NOTIFICATION_SERVICE_URLS').split(','),
    }) as const,
);

export type PushServiceWhitelistConfig = ReturnType<typeof PushServiceWhitelistConfigFactory>;
export const PushServiceWhitelistConfig = PushServiceWhitelistConfigFactory.KEY;
