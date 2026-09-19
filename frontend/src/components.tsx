import { formatUsdc, statusDescriptions, utc } from './data/presentation.ts';
import { statuses } from './data/types.ts';
import type { CaseDetail, CaseFilter as Filter, CaseSummaryViewModel, DemoScenario, EvidenceSelection, VerificationCheckViewModel, VerificationOutcome, VerificationStatus } from './data/types.ts';

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}><span aria-hidden="true" className="status-dot" />{status}</span>;
}

export function CaseFilter({ value, onChange }: { value: Filter; onChange: (filter: Filter) => void }) {
  return <div className="case-filters" aria-label="검증 상태 필터">{(['ALL', ...statuses] as const).map(filter => <button key={filter} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => onChange(filter)}>{filter}</button>)}</div>;
}
export function CaseListItem({ item, selected, onClick }: { item: CaseSummaryViewModel; selected: boolean; onClick: () => void }) {
  return <button className={`case-item ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}>
    <span className="case-item-top"><span className="mono">{item.id}</span><span aria-hidden="true">↗</span></span>
    <span className="case-amount">{item.amount} <small>USDC</small></span>
    <span className="case-decision">{item.decision === 'REJECT' ? 'REJECTED' : item.decision === 'APPROVE' ? 'APPROVED' : item.status === 'MISSING' ? '결정 없음' : '결정 대기'}<span className="list-separator">/</span><span>{item.label}</span></span>
    <StatusBadge status={item.status} />
  </button>;
}
export function CaseList({ cases, selectedId, filter, onFilter, onSelect }: { cases: CaseSummaryViewModel[]; selectedId: string | null; filter: Filter; onFilter: (filter: Filter) => void; onSelect: (id: string) => void }) {
  const filtered = cases.filter(item => filter === 'ALL' || item.status === filter);
  return <><div className="column-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Case List <span className="count">{cases.length.toString().padStart(2, '0')}</span></h2></div></div><CaseFilter value={filter} onChange={onFilter} />
    <div className="case-items">{filtered.map(item => <CaseListItem key={item.id} item={item} selected={selectedId === item.id} onClick={() => onSelect(item.id)} />)}{!filtered.length && <div className="empty-state">이 상태의 사건이 없습니다.<button className="text-button" onClick={() => onFilter('ALL')}>모든 사건 보기 →</button></div>}</div>
    </>;
}

export const evidenceLabels: Record<EvidenceSelection, string> = { policy: 'Policy Record', request: 'Request Record', verification_receipt: 'Verification Receipt', decision: 'Decision Record', anchors: 'On-chain Evidence' };
export function EvidenceTimelineItem({ index, title, subtitle, selected, state, onClick }: { index: number; title: string; subtitle: string; selected: boolean; state: string; onClick: () => void }) {
  return <li><button className={`timeline-item ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><span className="timeline-copy"><strong>{title}</strong><span>{subtitle}</span></span><span className="timeline-state">{state}</span><span aria-hidden="true" className="timeline-arrow">↗</span></button></li>;
}
export function EvidenceTimeline({ detail, selected, onSelect }: { detail: CaseDetail; selected: EvidenceSelection; onSelect: (value: EvidenceSelection) => void }) {
  const { bundle } = detail;
  const items: { key: EvidenceSelection; title: string; subtitle: string; state: string }[] = [
    { key: 'request', title: 'Request', subtitle: `${utc(Date.parse(bundle.request.created_at) / 1000)} · ${formatUsdc(bundle.request.amount_base_units)} USDC`, state: 'RECORDED' },
    { key: 'verification_receipt', title: 'Verification Receipt', subtitle: `${utc(bundle.verification_receipt.observed_at)} · Request Anchor 관측`, state: 'OBSERVED' },
    { key: 'decision', title: 'Decision', subtitle: bundle.decision ? `${bundle.decision.decision} / ${bundle.decision.reason_code} · 생성 시각 미제공` : '결정 기록 없음', state: bundle.decision ? 'RECORDED' : detail.report.status },
    { key: 'anchors', title: 'Evidence · On-chain Anchors', subtitle: `Request ${utc(detail.requestAnchor.timestamp)} · Decision ${detail.decisionAnchor ? utc(detail.decisionAnchor.timestamp) : '없음'}`, state: 'SEPOLIA' },
  ];
  return <section className="timeline-section" aria-labelledby="timeline-heading"><div className="section-heading"><h2 id="timeline-heading">Evidence Timeline</h2><span className="subdued">UTC</span></div><ol className="timeline">{items.map(({ key, ...item }, index) => <EvidenceTimelineItem key={key} {...item} index={index} selected={selected === key} onClick={() => onSelect(key)} />)}</ol><p className="timeline-hint">Anchor 시각은 각 기록의 등록 시각입니다. Decision 생성 시각과 구분됩니다.</p></section>;
}

export function VerificationChecklist({ checks }: { checks: VerificationCheckViewModel[] }) {
  return <ul className="checklist">{checks.map(check => <li key={check.id} className={`check-${check.state}`}><span className="check-icon" aria-label={{ passed: '통과', failed: '실패', 'not-run': '미실행', 'not-applicable': '해당 없음' }[check.state]}>{check.state === 'passed' ? '✓' : check.state === 'failed' ? '!' : '—'}</span><div><strong>{check.label}</strong><p>{check.detail}</p>{check.error && <code>{check.error}</code>}</div></li>)}</ul>;
}
export function VerificationResult({ result }: { result: VerificationOutcome }) {
  if (result.kind === 'unsupported') return <div className="context-note" role="status">{result.message}</div>;
  return <div className="upload-result"><div className="section-top"><h3>Verification Result</h3><StatusBadge status={result.report.status} /></div><p className="subdued">{statusDescriptions[result.report.status]}</p><details className="all-checks"><summary>검증 근거 자세히 보기</summary><VerificationChecklist checks={result.report.checks} /></details></div>;
}
export function DemoControls({ busy, onRun }: { busy: DemoScenario | null; onRun: (scenario: DemoScenario) => void }) {
  const demos: [DemoScenario, string, string][] = [['normal', 'Normal', '정상 거절'], ['tampered', 'Decision Tampered', '판단 기록 변조'], ['missing', 'Decision Missing', '기한 경과 후 누락'], ['deleted', 'Institution DB Deleted', '보관 증거로 검증']];
  return <section className="demo-section" aria-labelledby="demo-heading"><div className="section-top"><h2 id="demo-heading">Demo Controls</h2><span className="mock-tag">SIMULATION</span></div><p className="subdued">시나리오마다 새 사건을 만듭니다. Missing은 모의 Chain Time 기준 30초 기한을 사용합니다.</p><div className="demo-buttons">{demos.map(([key, label, description]) => <button key={key} disabled={!!busy} onClick={() => onRun(key)}><strong>{busy === key ? '실행 중…' : label}</strong><span>{description} <span aria-hidden="true">↗</span></span></button>)}</div></section>;
}
