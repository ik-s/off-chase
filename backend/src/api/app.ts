import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import type { EvidenceBundle } from '../records/schemas.ts';
import type { EvidenceStore, GatewayService } from '../verification/service.ts';
import type { VerificationReport } from '../verification/verifier.ts';
import type { CaseService } from './cases.ts';

type Gateway = Pick<GatewayService, 'submitRequest' | 'submitDecision'>;
type BundleStore = Pick<EvidenceStore, 'getBundle'>;

export interface ApiDependencies {
  gateway: Gateway;
  store: BundleStore;
  verify(evidence: unknown): Promise<VerificationReport>;
  cases?: CaseService;
  demosEnabled?: boolean;
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
      const status = code === 'INTERNAL_ERROR' ? 500 :
        ['REQUEST_ID_CONFLICT', 'REQUEST_ALREADY_ANCHORED', 'DECISION_ALREADY_ANCHORED', 'DEMO_RUN_IN_PROGRESS'].includes(code) ? 409 : 400;
      response.status(status).json({ error: code });
    }
  };
}

export function createApiApp(dependencies: ApiDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' }));

  if (dependencies.cases) {
    const cases = dependencies.cases;
    app.get('/api/cases', domainError(async (_request, response) => { response.json(await cases.list()); }));
    app.get('/api/cases/:requestId', domainError(async (request, response) => {
      const detail = await cases.detail(z.string().parse(request.params.requestId));
      if (!detail) { response.status(404).json({ error: 'EVIDENCE_NOT_FOUND' }); return; }
      response.json(detail);
    }));
    app.get('/api/demo/runs/:runId', domainError(async (request, response) => {
      const run = await cases.getRun(z.string().parse(request.params.runId));
      if (!run) { response.status(404).json({ error: 'RUN_NOT_FOUND' }); return; }
      response.json(run);
    }));
    app.post('/api/test/requests', domainError(async (request, response) => {
      if (!dependencies.demosEnabled) { response.status(403).json({ error: 'TEST_REQUESTS_DISABLED' }); return; }
      if (request.get('sec-fetch-site') === 'cross-site') { response.status(403).json({ error: 'CROSS_SITE_REQUEST' }); return; }
      const { amountBaseUnits, policyTamper } = z.strictObject({
        policyTamper: z.boolean().default(false),
        amountBaseUnits: z.string().regex(/^[1-9][0-9]{0,29}$/),
      }).parse(request.body);
      response.status(202).json(await cases.start(policyTamper ? 'tampered' : 'normal', amountBaseUnits));
    }));

  }

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
