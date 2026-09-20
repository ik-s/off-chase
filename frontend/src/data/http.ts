import { z } from 'zod';
import { EvidenceBundleSchema } from './records.ts';
import { formatUsdc } from './presentation.ts';
import { statuses, type CaseDetail, type DemoRun, type EvidenceRepository, type VerificationReportViewModel } from './types.ts';

const reportSchema = z.object({ status: z.enum(statuses), errors: z.array(z.string()), checks: z.array(z.object({
  id: z.string(), label: z.string(), state: z.enum(['passed', 'failed', 'not-run', 'not-applicable']), detail: z.string(),
  records: z.array(z.enum(['policy', 'request', 'verification_receipt', 'decision', 'anchors'])), error: z.string().optional(),
})) });
const runSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']).optional(), reasonCode: z.string().optional(), id: z.string(), requestId: z.string(), scenario: z.enum(['normal', 'tampered', 'unknown', 'missing']), status: z.enum(['running', 'complete', 'failed']), events: z.array(z.object({ stage: z.string(), at: z.string() })), error: z.string().optional() });
const detailSchema = z.object({ displayId: z.string().regex(/^REQ-\d{3,}$/), bundle: EvidenceBundleSchema, report: reportSchema, label: z.string(), institutionRecordPresent: z.boolean(), chainTime: z.number(),
  requestAnchor: z.object({ hash: z.string(), policyHash: z.string(), timestamp: z.number(), block: z.number() }),
  decisionAnchor: z.object({ hash: z.string(), timestamp: z.number(), block: z.number().nullable() }).nullable(),
  change: z.object({ before: z.string(), after: z.string() }).optional(), originalBundle: EvidenceBundleSchema.optional(), run: runSchema.nullable().optional(),
});

export function createHttpRepository(base = '/api', transport: typeof fetch = fetch): EvidenceRepository {
  const json = async (path: string, init?: RequestInit): Promise<unknown> => {
    const timeout = AbortSignal.timeout(30000);
    const response = await transport(`${base}${path}`, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout, headers: { 'Content-Type': 'application/json', ...init?.headers } });
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error('API 응답을 읽을 수 없습니다. 백엔드 연결을 확인하세요.'); }
    if (!response.ok && typeof value === 'object' && value && 'error' in value && value.error === 'POLICY_TAMPER_REQUIRES_BETWEEN_LIMITS_REQUEST') throw new Error('정책 변조 사례는 3,000 USDC 초과, 4,000 USDC 미만으로 실행해 주세요.');
    if (!response.ok) throw new Error(`API ${response.status}: ${typeof value === 'object' && value && 'error' in value ? String(value.error) : '요청 실패'}`);
    return value;
  };
  const waitForRun = async (run: DemoRun, onProgress?: (run: DemoRun) => void, signal?: AbortSignal) => {
      onProgress?.(run);
      const expires = Date.now() + 180000;
      while (run.status === 'running') {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (Date.now() > expires) throw new Error(`진행 조회 시간이 초과되었습니다. 실행 ID ${run.id}의 기록을 다시 확인하세요. 재실행 시 새 요청이 생성됩니다.`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        run = runSchema.parse(await json(`/demo/runs/${encodeURIComponent(run.id)}`, { signal }));
        onProgress?.(run);
      }
      if (run.status === 'failed') throw new Error(`${run.error ?? '실행 실패'} · 요청 ${run.requestId}`);
      return run.requestId;
  };
  return {
    async submitTestRequest(amountBaseUnits, onProgress, signal, policyTamper = false) {
      const run = runSchema.parse(await json('/test/requests', { method: 'POST', body: JSON.stringify({ amountBaseUnits, policyTamper }), signal }));
      return waitForRun(run, onProgress, signal);
    },
    mode: 'api',
    async listCases() {
      const rows = z.array(z.object({ id: z.string(), displayId: z.string().regex(/^REQ-\d{3,}$/), amountBaseUnits: z.string().regex(/^\d+$/), decision: z.enum(['REJECT', 'APPROVE']).nullable(), status: z.enum(statuses), label: z.string() })).parse(await json('/cases'));
      return rows.map(row => ({ ...row, amount: formatUsdc(row.amountBaseUnits) }));
    },
    async getCase(id): Promise<CaseDetail> { return detailSchema.parse(await json(`/cases/${encodeURIComponent(id)}`)); },
    async downloadEvidence(id) {
      const bundle = EvidenceBundleSchema.parse(await json(`/requests/${encodeURIComponent(id)}/evidence`));
      return { filename: `evidence-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`, content: JSON.stringify(bundle, null, 2) };
    },
    async verifyEvidence(bundle) {
      const report: VerificationReportViewModel = reportSchema.parse(await json('/verifier', { method: 'POST', body: JSON.stringify({ evidence: bundle }) }));
      return { kind: 'report', report };
    },
    async runDemo() {
      throw new Error('시나리오 생성은 종료되었습니다. 테스트 요청 화면을 사용해 주세요.');
    },
  };
}
