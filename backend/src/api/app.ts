import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import type { EvidenceBundle } from '../records/schemas.ts';
import type { EvidenceStore, GatewayService } from '../verification/service.ts';
import type { VerificationReport } from '../verification/verifier.ts';

type Gateway = Pick<GatewayService, 'submitRequest' | 'submitDecision'>;
type BundleStore = Pick<EvidenceStore, 'getBundle'>;

export interface ApiDependencies {
  gateway: Gateway;
  store: BundleStore;
  verify(evidence: unknown): Promise<VerificationReport>;
}

const requestEnvelope = z.strictObject({ request: z.unknown() });
const decisionEnvelope = z.strictObject({ decision: z.unknown() });
const evidenceEnvelope = z.strictObject({ evidence: z.unknown() });

function errorCode(error: unknown): string {
  if (error instanceof z.ZodError) return 'INVALID_EVIDENCE_SCHEMA';
  if (error instanceof Error && /^[A-Z_]+$/.test(error.message)) return error.message;
  return 'INTERNAL_ERROR';
}

function domainError(handler: RequestHandler): RequestHandler {
  return async (request, response, next) => {
    try {
      await handler(request, response, next);
    } catch (error) {
      const code = errorCode(error);
      response.status(code === 'INTERNAL_ERROR' ? 500 : 400).json({ error: code });
    }
  };
}

export function createApiApp(dependencies: ApiDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/requests', domainError(async (request, response) => {
    const { request: record } = requestEnvelope.parse(request.body);
    const bundle = await dependencies.gateway.submitRequest(record);
    response.status(201).json(bundle);
  }));

  app.post('/api/decisions', domainError(async (request, response) => {
    const { decision } = decisionEnvelope.parse(request.body);
    const bundle = await dependencies.gateway.submitDecision(decision);
    response.status(201).json(bundle);
  }));

  app.get('/api/requests/:requestId/evidence', domainError(async (request, response) => {
    const requestId = z.string().min(1).parse(request.params.requestId);
    const bundle = await dependencies.store.getBundle(requestId);
    if (!bundle) {
      response.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
      return;
    }
    response.type('application/json');
    response.attachment(`evidence-bundle-${requestId}.json`);
    response.send(bundle satisfies EvidenceBundle);
  }));

  app.post('/api/verifier', domainError(async (request, response) => {
    const { evidence } = evidenceEnvelope.parse(request.body);
    response.json(await dependencies.verify(evidence));
  }));

  return app;
}
