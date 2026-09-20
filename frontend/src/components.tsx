import { formatUsdc, statusDescriptions } from './data/presentation.ts';
import { statuses } from './data/types.ts';
import type { CaseDetail, CaseFilter as Filter, CaseSummaryViewModel, EvidenceSelection, VerificationCheckViewModel, VerificationOutcome, VerificationStatus } from './data/types.ts';

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}><span aria-hidden="true" className="status-dot" />{status}</span>;
}

export function CaseFilter({ value, onChange }: { value: Filter; onChange: (filter: Filter) => void }) {
  return <div className="case-filters" aria-label="검증 상태 필터">{(['ALL', ...statuses] as const).map(filter => <button key={filter} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => onChange(filter)}>{filter}</button>)}</div>;
}
export function CaseListItem({ item, selected, onClick }: { item: CaseSummaryViewModel; selected: boolean; onClick: () => void }) {
  return <button className={`case-item ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}>
    <span className="case-item-top"><span className="mono">{item.displayId ?? item.id}</span><span aria-hidden="true">↗</span></span>
    <span className="case-amount">{item.amount} <small>USDC</small></span>
    <span className="case-decision">{item.decision === 'REJECT' ? 'REJECTED' : item.decision === 'APPROVE' ? 'APPROVED' : item.status === 'MISSING' ? '결정 없음' : '결정 대기'}<span className="list-separator">/</span><span>{item.label}</span></span>
    <StatusBadge status={item.status} />
  </button>;
}
export function CaseList({ cases, selectedId, filter, onFilter, onSelect }: { cases: CaseSummaryViewModel[]; selectedId: string | null; filter: Filter; onFilter: (filter: Filter) => void; onSelect: (id: string) => void }) {
  const filtered = cases.filter(item => filter === 'ALL' || item.status === filter);
  return <><div className="column-heading"><div><span className="eyebrow">WORKSPACE</span><h2>거절 사건 <span className="count">{cases.length.toString().padStart(2, '0')}</span></h2></div></div><CaseFilter value={filter} onChange={onFilter} />
    <div className="case-items">{filtered.map(item => <CaseListItem key={item.id} item={item} selected={selectedId === item.id} onClick={() => onSelect(item.id)} />)}{!filtered.length && <div className="empty-state">표시할 거절 사건이 없습니다.<button className="text-button" onClick={() => onFilter('ALL')}>모든 거절 사건 보기 →</button></div>}</div>
    <div className="sidebar-note"><span className="eyebrow">EVIDENCE, NOT ASSUMPTIONS</span><p>기관의 현재 로그가 아닌,<br />당시 남겨진 증거를 확인합니다.</p><span>요청과 응답은 검증 레이어에 독립 보관됩니다.</span></div></>;
}

export const evidenceLabels: Record<EvidenceSelection, string> = { policy: 'Policy Record', request: 'Request Record', verification_receipt: 'Verification Receipt', decision: 'Decision Record', anchors: 'On-chain Evidence' };
export function EvidenceTimelineItem({ index, title, subtitle, selected, state, onClick }: { index: number; title: string; subtitle: string; selected: boolean; state: string; onClick: () => void }) {
  return <li><button className={`timeline-item ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><span className="timeline-copy"><strong>{title}</strong><span>{subtitle}</span></span><span className="timeline-state">{state}</span><span aria-hidden="true" className="timeline-arrow">↗</span></button></li>;
}
export function EvidenceTimeline({ detail, selected, onSelect }: { detail: CaseDetail; selected: EvidenceSelection; onSelect: (value: EvidenceSelection) => void }) {
  const { bundle } = detail;
  const items: { key: EvidenceSelection; title: string; subtitle: string; state: string }[] = [
    { key: 'policy', title: 'Enterprise Policy', subtitle: `1회 최대 ${formatUsdc(bundle.policy.max_amount_base_units)} USDC`, state: `POLICY V${bundle.policy.version}` },
    { key: 'request', title: 'Agent Request', subtitle: `${formatUsdc(bundle.request.amount_base_units)} USDC 결제 요청`, state: 'OBSERVED' },
    { key: 'verification_receipt', title: 'Verification Receipt', subtitle: '공식 Gateway에서 요청 관측 · Request Anchored', state: 'RECEIPT' },
    { key: 'decision', title: 'Institution Decision', subtitle: bundle.decision ? `${bundle.decision.decision} / ${bundle.decision.reason_code}` : 'Decision이 아직 없습니다', state: bundle.decision ? 'RECORDED' : detail.report.status },
    { key: 'anchors', title: 'On-chain Evidence', subtitle: `Request Anchored · ${detail.decisionAnchor ? 'Decision Anchored' : 'Decision Anchor 없음'}`, state: String(bundle.anchors.chain_id) },
  ];
  return <section className="timeline-section" aria-labelledby="timeline-heading"><div className="section-heading"><div><span className="eyebrow">FOLLOW THE EVIDENCE</span><h2 id="timeline-heading">Evidence Timeline</h2></div><span className="subdued">05 steps</span></div><ol className="timeline">{items.map(({ key, ...item }, index) => <EvidenceTimelineItem key={key} {...item} index={index} selected={selected === key} onClick={() => onSelect(key)} />)}</ol><p className="timeline-hint">각 단계를 선택해 오른쪽에서 검증 근거를 확인하세요.</p></section>;
}

export function VerificationChecklist({ checks }: { checks: VerificationCheckViewModel[] }) {
  return <ul className="checklist">{checks.map(check => <li key={check.id} className={`check-${check.state}`}><span className="check-icon" aria-label={{ passed: '통과', failed: '실패', 'not-run': '미실행', 'not-applicable': '해당 없음' }[check.state]}>{check.state === 'passed' ? '✓' : check.state === 'failed' ? '!' : '—'}</span><div><strong>{check.label}</strong><p>{check.detail}</p>{check.error && <code>{check.error}</code>}</div></li>)}</ul>;
}
export function VerificationResult({ result }: { result: VerificationOutcome }) {
  if (result.kind === 'unsupported') return <div className="context-note" role="status">{result.message}</div>;
  return <div className="upload-result"><div className="section-top"><h3>Verification Result</h3><StatusBadge status={result.report.status} /></div><p className="subdued">{statusDescriptions[result.report.status]}</p><details className="all-checks"><summary>검증 근거 자세히 보기</summary><VerificationChecklist checks={result.report.checks} /></details></div>;
}
