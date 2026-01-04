import { InternalServerErrorException, BadRequestException, PushProxyService } from './push-proxy.service.js';

interface APIGatewayProxyEvent {
  body: string | null;
  headers: { [name: string]: string | undefined };
  requestContext: {
    http: {
      method: string;
      path: string;
    };
  };
}

interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
  headers?: { [header: string]: boolean | number | string };
}

const ALLOWED_ORIGINS = new Set((process.env.WEB_ORIGIN || '').split(','));

function getAllowedOrigin(originHeader: string | undefined): string | null {
  if (!originHeader) return null;

  let originUrl;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return null;
  }

  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') {
    return null;
  }

  const canonicalOrigin = originUrl.origin;
  return ALLOWED_ORIGINS.has(canonicalOrigin) ? canonicalOrigin : null;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const pushProxyService = new PushProxyService(
    (process.env.ALLOWED_NOTIFICATION_SERVICE_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  try {
    if (event.requestContext.http.method === 'OPTIONS' && event.requestContext.http.path.endsWith('/push-proxy')) {
      return {
        statusCode: 200,
        body: '',
        headers: {
          'Access-Control-Allow-Origin': getAllowedOrigin(event.headers['origin']) || '',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      };
    }

    if (event.requestContext.http.path.endsWith('/push-proxy')) {
      try {
        const result = await pushProxyService.sendPushNotification(JSON.parse(event.body || '{}'));
        return { statusCode: 200, body: JSON.stringify(result) };
      } catch (error) {
        if (error instanceof BadRequestException) {
          return { statusCode: 400, body: JSON.stringify({ message: error.message }) };
        } else if (error instanceof InternalServerErrorException) {
          console.error('Internal server error:', error);
          return { statusCode: 500, body: '' };
        } else {
          console.error('Unexpected error:', error);
          return { statusCode: 500, body: '' };
        }
      }
    }

    return { statusCode: 404, body: '' };
  } catch (error) {
    console.error('Lambda execution error:', error);
    return { statusCode: 500, body: '' };
  }
};
