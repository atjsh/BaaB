import http from 'node:http';
import { URL } from 'node:url';
import { BadRequestException, InternalServerErrorException, PushProxyService } from './push-proxy.service.ts';

const ALLOWED_ORIGINS = new Set((process.env.WEB_ORIGIN || '').split(','));

const ALLOWED_METHODS = new Set(['POST']);
const ALLOWED_HEADERS = new Set(['content-type']);

const ALLOW_CREDENTIALS = true;
const PREFLIGHT_MAX_AGE_SECONDS = 600;

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

function setCorsHeaders(res: http.ServerResponse, allowedOrigin: string) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');

  if (ALLOW_CREDENTIALS) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

const pushProxyService = new PushProxyService(
  (process.env.ALLOWED_NOTIFICATION_SERVICE_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
);

const server = http.createServer((req, res) => {
  const originHeader = req.headers.origin;
  const allowedOrigin = getAllowedOrigin(originHeader);

  if (allowedOrigin) {
    setCorsHeaders(res, allowedOrigin);
  }

  if (req.method === 'OPTIONS') {
    if (!allowedOrigin) {
      res.statusCode = 204;
      res.end();
      return;
    }

    const requestedMethod = (req.headers['access-control-request-method'] || '').toString().toUpperCase();

    if (!ALLOWED_METHODS.has(requestedMethod)) {
      res.statusCode = 405;
      res.end();
      return;
    }

    res.setHeader('Access-Control-Allow-Headers', Array.from(ALLOWED_HEADERS).join(', '));
    res.setHeader('Access-Control-Allow-Methods', Array.from(ALLOWED_METHODS).join(', '));
    res.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/push-proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const parsedBody = JSON.parse(body);
        const result = await pushProxyService.sendPushNotification(parsedBody);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(result));
      } catch (error) {
        if (error instanceof BadRequestException) {
          res.statusCode = 400;
          res.end(error.message);
        } else if (error instanceof InternalServerErrorException) {
          res.statusCode = 500;
          res.end(error.message);
        } else {
          res.statusCode = 500;
          res.end('Unknown error occurred');
        }
      }
    });

    return;
  }

  res.statusCode = 404;
  res.end();
});

const port = process.env.PORT || '3000';

server.listen(Number(port), () => {
  console.log(`Server listening on http://localhost:${port}`);
});
