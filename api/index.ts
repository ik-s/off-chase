import { waitUntil } from '@vercel/functions';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRuntimeApp } from '../backend/src/api/server.ts';

let runtime: ReturnType<typeof createRuntimeApp> | undefined;
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    runtime ??= createRuntimeApp(process.env, { waitUntil });
    const { app } = await runtime;
    app(request, response);
  } catch {
    runtime = undefined;
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: 'API_STARTUP_FAILED' }));
  }
}
