export class BadRequestException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestException';
  }
}

export class InternalServerErrorException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InternalServerErrorException';
  }
}

export class PushProxyService {
  #pushServiceAllowlist: string[];

  constructor(pushServiceAllowlist: string[]) {
    this.#pushServiceAllowlist = pushServiceAllowlist;
  }

  public async sendPushNotification(reqBody: { endpoint: string; body: string; headers?: Record<string, string> }) {
    console.log(`[${new Date().toISOString()}] [${this.sendPushNotification.name}] ${JSON.stringify(reqBody)}`);

    const url = this.sanitizeUrl(reqBody.endpoint);
    if (!url) {
      throw new BadRequestException('Invalid endpoint');
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: reqBody.headers || {},
        body: Buffer.from(reqBody.body, 'base64'),
      });

      console.log(
        `[${new Date().toISOString()}] [${this.sendPushNotification.name}] fetch response - status ${response.status}, header ${JSON.stringify(response.headers)}, body ${await response.text()}`,
      );

      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] [${this.sendPushNotification.name}] Push notification failed`);

        throw new InternalServerErrorException(`Push notification failed with status ${response.status}`);
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${this.sendPushNotification.name}] Error sending push notification:`,
        error,
      );
      throw new InternalServerErrorException('Failed to send push notification');
    }

    return { success: true };
  }

  public sanitizeUrl(unsafeUrlInput: string): URL | null {
    try {
      const parsedUrl = new URL(unsafeUrlInput);
      const hostname = parsedUrl.hostname;

      const isAllowed = this.#pushServiceAllowlist.some((allowedPattern) => {
        if (allowedPattern.startsWith('*.')) {
          const domain = allowedPattern.slice(2);
          return hostname.endsWith(domain);
        } else {
          return hostname === allowedPattern;
        }
      });

      return isAllowed ? parsedUrl : null;
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${this.sanitizeUrl.name}] Invalid URL provided: ${unsafeUrlInput} - Allowed URLs are: ${this.#pushServiceAllowlist.join(', ')}`,
      );
      return null;
    }
  }
}
