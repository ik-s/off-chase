import { useRef, useState } from 'react';
import type { CaseDetail, EvidenceSelection, VerificationCheckViewModel, VerificationOutcome } from './data/types.ts';
import { formatUsdc, utc } from './data/presentation.ts';
import { EvidenceTimeline, StatusBadge, VerificationChecklist } from './components.tsx';
import { EvidenceDetail } from './EvidenceDetail.tsx';

const groups = [
  { title: '요청 출처', ids: ['schema', 'key', 'agent-signature', 'request-hash', 'references'] },
  { title: '적용 정책', ids: ['policy-signature', 'policy-hash'] },
  { title: '기관 판단', ids: ['institution-signature', 'policy'] },
  { title: '기록 무결성', ids: ['request-anchor', 'decision-hash', 'anchor', 'deadline'] },
];

function CheckSummary({ checks }: { checks: VerificationCheckViewModel[] }) {
  return <ul className="audit-checks">{groups.map(group => {
    const relevant = checks.filter(check => group.ids.includes(check.id));
    const failed = relevant.find(check => check.state === 'failed');
    const passed = relevant.length === group.ids.length && relevant.every(check => check.state === 'passed');
    return <li key={group.title}><strong>{group.title}</strong><span className={failed ? 'text-tampered' : passed ? 'text-verified' : 'text-processing'}>{failed ? '불일치' : passed ? '통과' : '확인 대기'}</span>{failed && <p>{failed.detail}</p>}</li>;
  })}</ul>;
}

interface Props {
  detail: CaseDetail;
  mock: boolean;
  onVerify: () => Promise<VerificationOutcome>;
  onDownload: () => void;
  downloading: boolean;
  onDemo: () => void;
}

export function GuidedCase({ detail, mock, onVerify, onDownload, downloading, onDemo }: Props) {
  const [view, setView] = useState<'Request' | 'Decision' | 'Evidence'>('Request');
  const [evidence, setEvidence] = useState<EvidenceSelection>('request');
  const [result, setResult] = useState<VerificationOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const { bundle } = detail;
  const report = result?.kind === 'report' ? result.report : detail.report;
  const inspected = { ...detail, report };
  const verify = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { setResult(await onVerify()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '검증 결과를 불러올 수 없습니다.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const changeView = (next: typeof view) => {
    setView(next);
    setEvidence(next === 'Request' ? 'request' : next === 'Decision' ? 'decision' : 'anchors');
  };

  return <div className="case-investigation">
    <section className="audit-case" aria-label="사건 상세">
      <div className="audit-title"><h1 tabIndex={-1}><span className="mono">{bundle.request.request_id}</span> · {view}</h1>{view === 'Evidence' && <StatusBadge status={report.status} />}</div>
      <dl className="audit-summary">
        <div><dt>Request Amount</dt><dd className="audit-amount">{formatUsdc(bundle.request.amount_base_units)} <small>USDC</small></dd></div>
        <div><dt>Institution Decision</dt><dd>{bundle.decision?.decision ?? 'NO DECISION'}</dd><span className="reason-code">{bundle.decision?.reason_code ?? '결정 기록 없음'}</span></div>
        <div><dt>Applied Policy</dt><dd>{formatUsdc(bundle.policy.max_amount_base_units)} <small>USDC</small></dd><button className="text-button" onClick={() => setEvidence('policy')}>Policy v{bundle.policy.version} ↗</button></div>
        <div><dt>Verification</dt><dd><StatusBadge status={report.status} /></dd><span className="audit-meta">{mock ? 'Mock result' : 'Verification result'}</span></div>
      </dl>
      <nav className="audit-tabs" aria-label="사건 보기">{(['Request', 'Decision', 'Evidence'] as const).map(item => <button key={item} aria-pressed={view === item} onClick={() => changeView(item)}>{item}</button>)}</nav>
      {view === 'Request' && <dl className="record-times" aria-label="요청 시각">
        <div><dt>Request created · UTC</dt><dd><time dateTime={bundle.request.created_at}>{utc(Date.parse(bundle.request.created_at) / 1000)}</time></dd></div>
        <div><dt>Policy valid from · UTC</dt><dd><time dateTime={bundle.policy.valid_from}>{utc(Date.parse(bundle.policy.valid_from) / 1000)}</time></dd></div>
      </dl>}
      {view === 'Decision' && <section className="audit-decision" aria-label="기관 판단">
        <strong>{bundle.decision?.decision ?? 'NO DECISION'}</strong><span className="reason-code">{bundle.decision?.reason_code ?? '결정 기록 없음'}</span>
        {detail.change && <p className="change-comparison">{detail.change.before} → {detail.change.after}</p>}
        <p className="audit-meta">결정 제출 기한 · {utc(bundle.verification_receipt.decision_deadline)}</p>
        <p className="audit-meta">판단 생성 시각: Record에 포함되지 않음</p>
        {!detail.institutionRecordPresent && bundle.decision && <p className="context-note">기관 DB 기록 없음 · 보관된 Evidence Bundle의 판단</p>}
      </section>}
      {view === 'Evidence' && <section aria-label="검증 결과" className="audit-verification">
        <div className="section-top"><h2>Verification Checklist</h2><button disabled={busy} onClick={() => void verify()}>{busy ? '검증 중…' : '다시 검증'}</button></div>
        <CheckSummary checks={report.checks} />
        <details className="all-checks"><summary>전체 검증 항목 · {report.checks.length}</summary><VerificationChecklist checks={report.checks} /></details>
        {error && <p role="alert" className="error-message">{error}</p>}
        {result?.kind === 'unsupported' && <p role="status" className="context-note">{result.message}</p>}
        <p className="audit-meta">{mock ? '모의 검증' : '검증 결과'} · {result?.kind === 'report' ? '재검증 시점의 결과' : '조회된 검증 결과'}</p>
        {report.status === 'PROCESSING' && <p className="audit-meta">결정 기한 {utc(bundle.verification_receipt.decision_deadline)} · 기한 이후 다시 검증</p>}
      </section>}
      <EvidenceTimeline detail={inspected} selected={evidence} onSelect={setEvidence} />
      <div className="audit-actions"><button disabled={downloading} onClick={onDownload}>{downloading ? '준비 중…' : 'Evidence 다운로드'}</button><button className="text-button" onClick={onDemo}>Demo Controls</button></div>
    </section>
    <aside className="audit-inspector" aria-label="Evidence Inspector"><EvidenceDetail detail={inspected} selected={evidence} mock={mock} /></aside>
  </div>;
}
