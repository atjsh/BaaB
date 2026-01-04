# The Proxy Server for BaaB

## Features

- Request forwarding for known push notification services

# Local Development Setup

## Node.js (v22.18.0+)

1. Create a `.env` file in the `apps/server` directory based on the `.env.example` file.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the server in watch mode.

# Production Setup

## Node.js (v22.18.0+)

1. Create a `.env` file in the `apps/server` directory based on the `.env.example` file.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to compile the TypeScript code.
4. Run `npm start` to start the server.

## AWS Lambda

1. Run `npm run build` to compile the TypeScript code.
2. Deploy the contents of the `dist/src/lambda.js` and `dist/src/push-proxy.service.js` files to your AWS Lambda function.
3. Setup the necessary environment variables in your Lambda configuration.
4. Configure an API Gateway to route requests to your Lambda function.
