import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';

import { PushServiceWhitelistConfig } from '../../config/push-service-whitelist.config';

import { SendPushNotificationReqBody } from './push-proxy.dto';

@Injectable()
export class PushProxyService {
  constructor(
    @Inject(PushServiceWhitelistConfig)
    private readonly pushServiceWhitelistConfig: PushServiceWhitelistConfig,
  ) {}

  async sendPushNotification(reqBody: SendPushNotificationReqBody) {
    const url = this.sanitizeUrl(reqBody.endpoint);
    if (!url) {
      throw new BadRequestException('Invalid endpoint');
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: reqBody.headers,
        body: typeof reqBody.body === 'string' ? reqBody.body : JSON.stringify(reqBody.body),
      });

      if (!response.ok) {
        throw new HttpException(`Push notification failed with status ${response.status}`, response.status);
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw new HttpException('Failed to send push notification', 500);
    }

    return { success: true };
  }

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
