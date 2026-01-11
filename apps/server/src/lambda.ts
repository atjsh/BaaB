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

const ALLOW_CREDENTIALS = true;

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

function getCorsHeaders(allowedOrigin: string | null): { [header: string]: string } {
  if (!allowedOrigin) {
    return {};
  }

  const headers: { [header: string]: string } = {
    'Access-Control-Allow-Origin': allowedOrigin,
    Vary: 'Origin',
  };

  if (ALLOW_CREDENTIALS) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const pushProxyService = new PushProxyService(
    (process.env.ALLOWED_NOTIFICATION_SERVICE_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  const allowedOrigin = getAllowedOrigin(event.headers['origin']);
  const corsHeaders = getCorsHeaders(allowedOrigin);

  try {
    if (event.requestContext.http.method === 'OPTIONS' && event.requestContext.http.path.endsWith('/push-proxy')) {
      return {
        statusCode: 200,
        body: '',
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      };
    }

    if (event.requestContext.http.path.endsWith('/push-proxy')) {
      try {
        const result = await pushProxyService.sendPushNotification(JSON.parse(event.body || '{}'));
        return { statusCode: 200, body: JSON.stringify(result), headers: corsHeaders };
      } catch (error) {
        if (error instanceof BadRequestException) {
          return { statusCode: 400, body: JSON.stringify({ message: error.message }), headers: corsHeaders };
        } else if (error instanceof InternalServerErrorException) {
          console.error('Internal server error:', error);
          return { statusCode: 500, body: '', headers: corsHeaders };
        } else {
          console.error('Unexpected error:', error);
          return { statusCode: 500, body: '', headers: corsHeaders };
        }
      }
    }

    return { statusCode: 404, body: '', headers: corsHeaders };
  } catch (error) {
    console.error('Lambda execution error:', error);
    return { statusCode: 500, body: '', headers: corsHeaders };
  }
};
