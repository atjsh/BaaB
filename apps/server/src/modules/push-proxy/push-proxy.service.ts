import { Inject, Injectable } from '@nestjs/common';

import { PushServiceWhitelistConfig } from '../../config/push-service-whitelist.config';

@Injectable()
export class PushProxyService {
  constructor(
    @Inject(PushServiceWhitelistConfig)
    private readonly pushServiceWhitelistConfig: PushServiceWhitelistConfig,
  ) {}

  public sanitizeUrl(unsafeUrlInput: string): URL | null {
    try {
      const parsedUrl = new URL(unsafeUrlInput);
      const hostname = parsedUrl.hostname;

      const isAllowed = this.pushServiceWhitelistConfig.allowedNotificationServiceUrls.some((allowedPattern) => {
        if (allowedPattern.startsWith('*.')) {
          const domain = allowedPattern.slice(2);
          return hostname.endsWith(domain);
        } else {
          return hostname === allowedPattern;
        }
      });

      return isAllowed ? parsedUrl : null;
    } catch (error) {
      console.error('Invalid URL provided:', unsafeUrlInput);
      return null;
    }
  }
}
