import { EvidenceBundleSchema } from './records.ts';
import type { EvidenceBundle } from './records.ts';
import { formatUsdc, toSummary } from './presentation.ts';
import type { CaseDetail, DemoScenario, EvidenceRepository, EvidenceSelection, VerificationCheckViewModel, VerificationReportViewModel, VerificationStatus } from './types.ts';

// Deliberately non-cryptographic fixture values. Never send these to a real chain.
const hash = (digit: string) => `0x${digit.repeat(64)}`;
const signature = `0x${'a'.repeat(130)}`;
const origin = Date.parse('2026-09-19T01:00:00Z') / 1000;
const allRecords: EvidenceSelection[] = ['policy', 'request', 'verification_receipt', 'decision', 'anchors'];

export function missingStatus(chainTime: number, deadline: number): 'PROCESSING' | 'MISSING' {
  return chainTime <= deadline ? 'PROCESSING' : 'MISSING';
}

function check(id: string, label: string, records: EvidenceSelection[], state: VerificationCheckViewModel['state'] = 'passed', detail = '사전 정의된 Mock 검사 결과입니다.', error?: string): VerificationCheckViewModel {
  return { id, label, records, state, detail, error };
}

function makeReport(status: VerificationStatus, amount = '4500000000', limit = '4000000000'): VerificationReportViewModel {
  const absent = status === 'PROCESSING' || status === 'MISSING';
  const invalid = status === 'INVALID';
  const tampered = status === 'TAMPERED';
  const checks = [
    check('schema', 'Schema valid', allRecords),
    check('key', 'Official key confirmed', allRecords, invalid ? 'failed' : 'passed', invalid ? 'Agent key가 공식 Registry에 없습니다. (Mock)' : '공식 역할의 key로 표시된 데모입니다.', invalid ? 'INVALID_AGENT_SIGNATURE' : undefined),
    check('policy-signature', 'Enterprise Signature', ['policy']),
    check('agent-signature', 'Agent Signature', ['request'], invalid ? 'not-run' : 'passed', invalid ? '공식 key를 확인할 수 없어 검사를 실행하지 않았습니다.' : undefined),
    check('receipt-signature', 'Verification Signature', ['verification_receipt']),
    check('institution-signature', 'Institution Signature', ['decision'], absent ? 'not-applicable' : 'passed', absent ? 'Decision이 아직 없습니다.' : tampered ? '기관이 변경한 기록에 다시 서명한 경우를 가정합니다.' : '기관이 서명한 Decision의 모의 검증 결과입니다.'),
    check('request-hash', 'Request Hash Match', ['request', 'verification_receipt', 'decision', 'anchors']),
    check('policy-hash', 'Policy Hash Match', ['policy', 'request', 'verification_receipt', 'decision', 'anchors']),
    check('request-anchor', 'Request Anchor Exists', ['request', 'verification_receipt', 'anchors']),
    check('decision-hash', 'Decision Hash Match', ['decision', 'anchors'], absent ? 'not-applicable' : tampered ? 'failed' : 'passed', absent ? 'Decision이 없어 비교하지 않습니다.' : tampered ? '변경된 Decision이 보관된 Anchor와 다릅니다.' : undefined, tampered ? 'DECISION_HASH_MISMATCH' : undefined),
    check('anchor', 'On-chain Anchor Match', ['decision', 'anchors'], absent ? 'not-applicable' : tampered ? 'failed' : 'passed', absent ? 'Decision Anchor가 없습니다.' : tampered ? '과거 Anchor는 그대로 유지되어 있습니다.' : undefined, tampered ? 'DECISION_HASH_MISMATCH' : undefined),
    check('references', 'Record References Match', ['request', 'verification_receipt', 'decision']),
    check('policy', 'Decision Matches Policy', ['policy', 'decision'], absent ? 'not-applicable' : tampered ? 'failed' : 'passed', absent ? '기관 응답이 없어 정책과 판단의 일치 여부는 검사하지 않습니다.' : tampered ? `${formatUsdc(amount)} USDC ≤ ${formatUsdc(limit)} USDC: 이 데모의 한도 정책은 승인 대상이지만 현재 기록은 REJECT / KYT_RISK입니다. KYT 위험 자체는 검증하지 않습니다.` : `${formatUsdc(amount)} USDC > ${formatUsdc(limit)} USDC → REJECT / LIMIT_EXCEEDED`, tampered ? 'POLICY_MISMATCH' : undefined),
    check('deadline', absent ? 'Decision Deadline' : 'Decision Within Deadline', ['verification_receipt', 'decision', 'anchors'], status === 'MISSING' ? 'failed' : status === 'PROCESSING' ? 'not-run' : 'passed', status === 'MISSING' ? '모의 Chain Time이 기한을 초과했고 Decision Anchor가 없습니다.' : status === 'PROCESSING' ? '아직 기한 이내입니다. 결정 누락으로 판정하지 않습니다.' : '기한 내 Decision Anchor가 있는 데모입니다.', status === 'MISSING' ? 'MISSING_DECISION' : undefined),
  ];
  if (invalid) {
    for (const item of checks) {
      if (item.id === 'schema' || item.id === 'key') continue;
      item.state = 'not-run';
      item.detail = '요청자의 공식 키를 확인하지 못했습니다. 제출된 서명·접수·응답·Anchor는 아직 신뢰할 수 없어 후속 검사를 실행하지 않았습니다.';
      item.error = undefined;
    }
  }
  return { status, errors: [...new Set(checks.flatMap(c => c.error ? [c.error] : []))], checks };
}

function makeCase(id: string, kind: DemoScenario | 'invalid' | 'deleted', offset: number, pending = false): CaseDetail {
  const observed = origin + offset;
  const missing = kind === 'missing';
  // Keep the normal rejection fixed. Tamper/missing demos start within the limit.
  const amount = kind === 'tampered' || missing ? '3500000000' : '4500000000';
  const bundle: EvidenceBundle = {
    schema_version: 1,
    policy: {
      schema_version: 1, policy_id: 'payment-limit-v1', version: 1, asset: 'USDC',
      max_amount_base_units: '4000000000', valid_from: '2026-09-19T00:00:00Z',
      enterprise_key_id: 'enterprise-key-1', enterprise_signature: signature,
    },
    request: {
      schema_version: 1, request_id: id, created_at: new Date(observed * 1000).toISOString(),
      asset: 'USDC', amount_base_units: amount, recipient: `0x${'1'.repeat(40)}`,
      policy_id: 'payment-limit-v1', policy_hash: hash('2'), nonce: hash('3'),
      agent_key_id: kind === 'invalid' ? 'unregistered-agent-key' : 'agent-key-1', agent_signature: signature,
    },
    verification_receipt: {
      schema_version: 1, request_id: id, request_hash: hash('4'), policy_hash: hash('2'),
      request_anchor_tx: hash('5'), request_anchor_block: 12345678 + offset,
      observed_at: observed, decision_deadline: observed + 30,
      verification_key_id: 'verification-key-1', verification_signature: signature,
    },
    decision: missing ? null : {
      schema_version: 1, request_id: id, request_hash: hash('4'), policy_id: 'payment-limit-v1',
      policy_hash: hash('2'), decision: 'REJECT', reason_code: kind === 'tampered' ? 'KYT_RISK' : 'LIMIT_EXCEEDED',
      institution_key_id: 'institution-key-1', institution_signature: signature,
    },
    anchors: {
      chain_id: 11155111, contract_address: `0x${'6'.repeat(40)}`, request_tx: hash('5'),
      ...(missing ? {} : { decision_tx: hash('7') }),
    },
  };
  return {
    bundle,
    report: makeReport(missing ? pending ? 'PROCESSING' : 'MISSING' : kind === 'tampered' ? 'TAMPERED' : kind === 'invalid' ? 'INVALID' : 'VERIFIED', amount),
    label: { normal: '정상 거절', unknown: '알 수 없는 거절', tampered: '승인 기록을 거절로 변조', missing: '한도 이내 요청 · 응답 대기 / 누락', deleted: '거절 기록 삭제 · 보관 증거 유지', invalid: '요청자 확인 실패 · 응답 미검증' }[kind],
    institutionRecordPresent: !missing && kind !== 'deleted',
    chainTime: observed + (pending ? 5 : 31),
    requestAnchor: { hash: hash('4'), policyHash: hash('2'), timestamp: observed, block: 12345678 + offset },
    decisionAnchor: missing ? null : { hash: hash(kind === 'tampered' ? '9' : '8'), timestamp: observed + 12, block: 12345679 + offset },
    ...(kind === 'tampered' ? { change: { before: 'APPROVE · 한도 이내', after: 'REJECT / KYT_RISK' } } : {}),
  };
}

// Structural fixture recognition only; this is not canonicalization or verification.
function sameFixture(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(k => Object.hasOwn(right, k) && sameFixture(left[k], right[k]));
}

export function createMockRepository(options: { clock?: () => number; latency?: number } = {}): EvidenceRepository {
  // An injected monotonic clock advances a simulated chain, never the PC date.
  const clock = options.clock ?? (() => performance.now() / 1000);
  const starts = new Map<string, number>();
  const cases = new Map<string, CaseDetail>();
  const initial: Array<[DemoScenario | 'invalid', boolean]> = [['normal', false], ['tampered', false], ['missing', false], ['missing', true], ['invalid', false]];
  initial.forEach(([kind, pending], index) => {
    const id = `REQ-${String(index + 1).padStart(3, '0')}`;
    cases.set(id, makeCase(id, kind, index * 60, pending));
    if (pending) starts.set(id, clock());
  });
  let sequence = 5;
  const delay = () => new Promise<void>(resolve => setTimeout(resolve, options.latency ?? 100));
  const read = (id: string): CaseDetail => {
    const stored = cases.get(id);
    if (!stored) throw new Error('요청한 사건을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
    const item = structuredClone(stored);
    const start = starts.get(id);
    if (start !== undefined) {
      item.chainTime += Math.max(0, Math.floor(clock() - start));
      item.report = makeReport(missingStatus(item.chainTime, item.bundle.verification_receipt.decision_deadline), item.bundle.request.amount_base_units, item.bundle.policy.max_amount_base_units);
    }
    return item;
  };
  return {
    mode: 'mock',
    async listCases() { await delay(); return [...cases.keys()].map(id => toSummary(read(id))); },
    async getCase(id) { await delay(); return read(id); },
    async downloadEvidence(id) {
      await delay();
      return { filename: `evidence-bundle-${id}.json`, content: JSON.stringify(read(id).bundle, null, 2) };
    },
    async verifyEvidence(input) {
      await delay();
      const parsed = EvidenceBundleSchema.safeParse(input);
      if (!parsed.success) return { kind: 'report', report: {
        status: 'INVALID', errors: ['INVALID_EVIDENCE_SCHEMA'],
        checks: [check('schema', 'Schema valid', allRecords, 'failed', 'Evidence Bundle의 필수 필드 또는 형식을 확인해 주세요.', 'INVALID_EVIDENCE_SCHEMA')],
      } };
      const match = [...cases.values()].find(item => sameFixture(item.bundle, input));
      if (!match) return { kind: 'unsupported', message: '이 파일은 제공된 Mock Fixture와 다릅니다. 실제 증거 검증에는 API Verifier 연동이 필요합니다. 검증 결과는 생성하지 않았습니다.' };
      return { kind: 'report', report: read(match.bundle.request.request_id).report };
    },
    async runDemo(scenario) {
      await delay();
      const id = `REQ-${String(++sequence).padStart(3, '0')}`;
      cases.set(id, makeCase(id, scenario, sequence * 60, scenario === 'missing'));
      if (scenario === 'missing') starts.set(id, clock());
      return id;
    },
  };
}
