import type { CaseDetail, CaseSummaryViewModel } from './types.ts';

export function formatUsdc(baseUnits: string): string {
  const value = BigInt(baseUnits);
  const whole = (value / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function toSummary(item: CaseDetail): CaseSummaryViewModel {
  return {
    id: item.bundle.request.request_id, amount: formatUsdc(item.bundle.request.amount_base_units),
    decision: item.bundle.decision?.decision ?? null,
    status: item.report.status, label: item.label,
  };
}

export function utc(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export const statusDescriptions = {
  VERIFIED: '증거와 정책 판단이 일치합니다.',
  PROCESSING: '요청은 관측됐으며, 아직 결정 기한 이전입니다.',
  MISSING: '결정 기한이 지났지만 Decision Anchor가 없습니다.',
  TAMPERED: '현재 Record가 과거 Anchor와 일치하지 않습니다.',
  INVALID: '공식 증거의 구조 또는 연결 조건을 충족하지 못했습니다.',
};
