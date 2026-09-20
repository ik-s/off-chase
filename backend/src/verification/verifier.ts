import type { Address, Hex } from 'viem';
import { hashRecord, verifyRecordSignature } from '../crypto/records.ts';
import type { AnchorRecord } from '../blockchain/anchorClient.ts';
import { EvidenceBundleSchema, type EvidenceBundle } from '../records/schemas.ts';
import type { KeyRegistry } from '../institution/mockWallet.ts';
import { matchesDecisionPolicy } from '../institution/decisionPolicy.ts';

export interface VerificationCheck {
  id: string; label: string; state: 'passed' | 'failed' | 'not-run' | 'not-applicable';
  detail: string; records: string[]; error?: string;
}

export type VerificationStatus = 'VERIFIED' | 'TAMPERED' | 'MISSING' | 'PROCESSING' | 'INVALID';
export interface VerificationReport {
  status: VerificationStatus;
  errors: string[];
  checks?: VerificationCheck[];
}

export interface AnchorReader {
  readonly address: Address;
  readonly chainId: number;
  readRecord(requestId: string): Promise<AnchorRecord>;
  chainTime(): Promise<number>;
  verifyRequestTx(input: {
    requestId: string; requestHash: Hex; policyHash: Hex; tx: Hex;
    blockNumber: number; observedAt: number; decisionDeadline: number;
  }): Promise<boolean>;
  verifyDecisionTx(input: { requestId: string; decisionHash: Hex; tx: Hex; anchoredAt: number }): Promise<boolean>;
}

export async function verifyEvidence(
  input: unknown,
  registry: KeyRegistry,
  chain: AnchorReader,
  detailed = false,
): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  const add = (id: string, ok: boolean, records: string[], detail: string, error?: string) => {
    checks.push({ id, label: detail, state: ok ? 'passed' : 'failed', detail, records, ...(!ok && error ? { error } : {}) });
    return ok;
  };
  const finish = (status: VerificationStatus, errors: string[]): VerificationReport => ({ status, errors, ...(detailed ? { checks } : {}) });
  const parsed = EvidenceBundleSchema.safeParse(input);
  add('schema', parsed.success, ['request', 'policy', 'decision'], '증거 파일 구조 검사', 'INVALID_EVIDENCE_SCHEMA');
  if (!parsed.success) return finish('INVALID', ['INVALID_EVIDENCE_SCHEMA']);
  const bundle: EvidenceBundle = parsed.data;
  const errors: string[] = [];
  let chainMismatch = false;
  const { policy, request, verification_receipt: receipt, decision } = bundle;

  if (bundle.anchors.chain_id !== chain.chainId ||
      bundle.anchors.contract_address.toLowerCase() !== chain.address.toLowerCase()) {
    errors.push('INVALID_REQUEST_REFERENCE');
  }

  const signatures: Array<{ record: object; signature: string; key: string; error: string }> = [
    { record: policy, signature: 'enterprise_signature', key: policy.enterprise_key_id, error: 'INVALID_ENTERPRISE_SIGNATURE' },
    { record: request, signature: 'agent_signature', key: request.agent_key_id, error: 'INVALID_AGENT_SIGNATURE' },
    { record: receipt, signature: 'verification_signature', key: receipt.verification_key_id, error: 'INVALID_VERIFICATION_SIGNATURE' },
  ];
  if (decision) signatures.push({
    record: decision, signature: 'institution_signature', key: decision.institution_key_id, error: 'INVALID_INSTITUTION_SIGNATURE',
  });
  for (const { record, signature, key, error } of signatures) {
    const address = registry[key];
    const id = ({ enterprise_signature: 'policy-signature', agent_signature: 'agent-signature', verification_signature: 'receipt-signature', institution_signature: 'institution-signature' } as Record<string, string>)[signature];
    const kind = ({ enterprise_signature: 'policy', agent_signature: 'request', verification_signature: 'verification_receipt', institution_signature: 'decision' } as Record<string, string>)[signature];
    if (!add(id, !!address && await verifyRecordSignature(record, signature, address), [kind], `${key} 서명 검증`, error)) errors.push(error);
  }
  add('key', signatures.every(s => !!registry[s.key]), ['request', 'policy', 'decision'], '공개키 등록부와 서명자 ID 비교');

  const policyHash = hashRecord(policy, 'enterprise_signature');
  const requestHash = hashRecord(request, 'agent_signature');
  const decisionHash = decision ? hashRecord(decision, 'institution_signature') : null;
  if (request.policy_hash !== policyHash || request.policy_id !== policy.policy_id || request.asset !== policy.asset ||
      Date.parse(request.created_at) < Date.parse(policy.valid_from) ||
      receipt.policy_hash !== policyHash || (decision && (decision.policy_hash !== policyHash || decision.policy_id !== policy.policy_id))) {
    errors.push('POLICY_MISMATCH');
  }
  if (receipt.request_id !== request.request_id || receipt.request_hash !== requestHash ||
      receipt.request_anchor_tx !== bundle.anchors.request_tx ||
      (decision && (decision.request_id !== request.request_id || decision.request_hash !== requestHash))) {
    errors.push('INVALID_REQUEST_REFERENCE');
  }
  if ((decision && !bundle.anchors.decision_tx) || (!decision && bundle.anchors.decision_tx)) {
    errors.push('INVALID_REQUEST_REFERENCE');
  }

  const onChain = await chain.readRecord(request.request_id);
  add('policy-hash', !errors.includes('POLICY_MISMATCH'), ['policy'], '요청·접수·응답의 정책 참조 비교', 'POLICY_MISMATCH');
  add('references', !errors.includes('INVALID_REQUEST_REFERENCE'), ['request', 'decision'], '체인 설정·요청·응답 참조 비교', 'INVALID_REQUEST_REFERENCE');
  if (!onChain.requestHash) {
    add('request-anchor', false, ['request', 'anchors'], '요청 Anchor가 없습니다.', 'INVALID_REQUEST_REFERENCE');
    errors.push('INVALID_REQUEST_REFERENCE');
  } else {
    if (!add('request-hash', onChain.requestHash === requestHash, ['request', 'anchors'], '온체인 요청 Hash 비교', 'REQUEST_HASH_MISMATCH')) {
      errors.push('REQUEST_HASH_MISMATCH');
      chainMismatch = true;
    }
    if (!add('policy-anchor', onChain.policyHash === policyHash, ['policy', 'anchors'], '요청 당시 온체인 정책 Hash 비교', 'POLICY_MISMATCH')) {
      errors.push('POLICY_MISMATCH');
      chainMismatch = true;
    }
    if (!add('receipt-time', receipt.observed_at === onChain.requestAnchoredAt && receipt.decision_deadline === onChain.decisionDeadline, ['verification_receipt'], '접수 시각·기한과 블록 기록 비교', 'INVALID_REQUEST_REFERENCE')) {
      errors.push('INVALID_REQUEST_REFERENCE');
    }
    if (!add('request-anchor', await chain.verifyRequestTx({
      requestId: request.request_id, requestHash, policyHash, tx: bundle.anchors.request_tx as Hex,
      blockNumber: receipt.request_anchor_block, observedAt: receipt.observed_at,
      decisionDeadline: receipt.decision_deadline,
    }), ['request', 'anchors'], '요청 트랜잭션 이벤트 검사', 'INVALID_REQUEST_REFERENCE')) errors.push('INVALID_REQUEST_REFERENCE');
    if (!add('decision-hash', decisionHash === onChain.decisionHash, ['decision', 'anchors'], '기관 응답 Hash와 Anchor 비교', 'DECISION_HASH_MISMATCH')) {
      errors.push('DECISION_HASH_MISMATCH');
      chainMismatch = true;
    }
    if (onChain.decisionAnchoredAt !== null && !add('deadline', onChain.decisionAnchoredAt <= onChain.decisionDeadline, ['decision', 'anchors'], '응답 Anchor 기한 검사', 'DEADLINE_EXPIRED')) {
      errors.push('DEADLINE_EXPIRED');
    }
    if (decisionHash && bundle.anchors.decision_tx && onChain.decisionAnchoredAt !== null &&
        !add('anchor', await chain.verifyDecisionTx({
          requestId: request.request_id, decisionHash, tx: bundle.anchors.decision_tx as Hex,
          anchoredAt: onChain.decisionAnchoredAt,
        }), ['decision', 'anchors'], '응답 트랜잭션 이벤트 검사', 'INVALID_REQUEST_REFERENCE')) errors.push('INVALID_REQUEST_REFERENCE');
  }

  if (decision) {
    if (decision.decision === 'REJECT' && decision.reason_code === 'KYT_RISK') {
      checks.push({ id: 'policy', label: '거절 사유의 타당성', state: 'not-applicable', records: ['decision'], detail: 'KYT_RISK는 기관이 주장한 사유입니다. 위험 근거와 판단의 타당성은 검증 범위 밖입니다.' });
    } else if (!add('policy', matchesDecisionPolicy(request, policy, decision), ['policy', 'decision'], '금액 정책과 판단 비교', 'POLICY_MISMATCH')) {
      errors.push('POLICY_MISMATCH');
    }
  }

  const uniqueErrors = [...new Set(errors)];
  for (const id of ['institution-signature', 'request-hash', 'request-anchor', 'decision-hash', 'anchor', 'deadline', 'policy']) {
    if (!checks.some(c => c.id === id)) checks.push({ id, label: id, state: 'not-run', records: ['decision', 'anchors'], detail: '필요한 응답 또는 Anchor가 없어 검사하지 못했습니다.' });
  }
  if (chainMismatch) return finish('TAMPERED', uniqueErrors);
  if (uniqueErrors.length > 0) return finish('INVALID', uniqueErrors);
  if (!decision) {
    return (await chain.chainTime()) <= onChain.decisionDeadline
      ? finish('PROCESSING', [])
      : finish('MISSING', ['MISSING_DECISION']);
  }
  return finish('VERIFIED', []);
}
