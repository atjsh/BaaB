import { Inject, Injectable, BadRequestException, HttpException } from '@nestjs/common';

import { PushServiceWhitelistConfig } from '../../config/push-service-whitelist.config';
import { SendPushNotificationReqBody } from './push-proxy.dto';

@Injectable()
export class PushProxyService {
  constructor(
    @Inject(PushServiceWhitelistConfig)
    private readonly pushServiceWhitelistConfig: PushServiceWhitelistConfig,
  ) {}

  async sendPushNotification(reqBody: SendPushNotificationReqBody) {
    console.log({ reqBody });

    const url = this.sanitizeUrl(reqBody.endpoint);
    if (!url) {
      throw new BadRequestException('Invalid endpoint');
    }

    // Fallback to raw fetch (existing logic)
    try {
      let body: any = reqBody.body;
      const headers = reqBody.headers || {};

      // If body is base64 encoded string (from client encryption), convert to buffer
      // The client sends 'body' as base64url string of the encrypted binary
      if (typeof body === 'string') {
        // Check if it looks like base64 (simple check)
        // Or we can assume it is base64 if headers indicate encryption
        if (headers['Content-Encoding'] === 'aes128gcm' || headers['content-encoding'] === 'aes128gcm') {
          body = Buffer.from(body, 'base64');
        }
      } else if (typeof body !== 'string') {
        body = JSON.stringify(body);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        console.error('Push notification failed with status:', response.status);
        console.error('Response body:', await response.text());

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
