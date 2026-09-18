import { useEffect, useRef, useState } from 'react';
import type { CaseDetail, EvidenceSelection, VerificationCheckViewModel, VerificationOutcome } from './data/types.ts';
import { formatUsdc, statusDescriptions, utc } from './data/presentation.ts';
import { EvidenceTimeline, StatusBadge, VerificationChecklist } from './components.tsx';
import { EvidenceDetail } from './EvidenceDetail.tsx';

const steps = ['요청 확인', '판단 이해', '증거 검증'];
const groups = [
  { title: '요청의 출처', description: '공식 경로로 접수된 Agent의 요청인가요?', ids: ['schema', 'key', 'agent-signature', 'request-hash', 'references'] },
  { title: '적용된 정책', description: '당시 기업이 정한 한도와 연결되나요?', ids: ['policy-signature', 'policy-hash'] },
  { title: '기관의 판단', description: '결정과 사유가 정책에 부합하나요?', ids: ['institution-signature', 'policy'] },
  { title: '기록의 무결성', description: '과거 기록과 일치하고 누락은 없나요?', ids: ['request-anchor', 'decision-hash', 'anchor', 'deadline'] },
];

function CheckSummary({ checks }: { checks: VerificationCheckViewModel[] }) {
  return <ul className="flow-checks">{groups.map(group => {
    const relevant = checks.filter(check => group.ids.includes(check.id));
    const failed = relevant.find(check => check.state === 'failed');
    const passed = relevant.length === group.ids.length && relevant.every(check => check.state === 'passed');
    const state = failed ? 'failed' : passed ? 'passed' : 'pending';
    return <li key={group.title} className={`flow-check-${state}`}><span className="flow-check-symbol" aria-hidden="true">{failed ? '!' : passed ? '✓' : '—'}</span><div><strong>{group.title}</strong><p>{failed?.detail ?? group.description}</p></div><span className="flow-check-label">{failed ? '불일치' : passed ? '확인됨' : '확인 대기'}</span></li>;
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
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [result, setResult] = useState<VerificationOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technical, setTechnical] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceSelection>(detail.bundle.decision ? 'decision' : 'verification_receipt');
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const verifyLock = useRef(false);
  const { bundle } = detail;
  const requestAmount = formatUsdc(bundle.request.amount_base_units);
  const limit = formatUsdc(bundle.policy.max_amount_base_units);
  const rejected = bundle.decision?.decision === 'REJECT';

  useEffect(() => {
    if (previousStep.current !== step) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      previousStep.current = step;
    }
  }, [step]);

  const advance = (next: number) => { setFurthest(value => Math.max(value, next)); setStep(next); };
  const verify = async () => {
    if (verifyLock.current) return;
    verifyLock.current = true;
    setBusy(true); setError(null); setResult(null); advance(2);
    try { setResult(await onVerify()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '검증 결과를 불러올 수 없습니다. 다시 시도해 주세요.'); }
    finally { verifyLock.current = false; setBusy(false); }
  };

  return <>
    <nav className="flow-steps" aria-label="사건 확인 단계"><ol>{steps.map((label, index) => <li key={label}><button aria-current={step === index ? 'step' : undefined} disabled={index > furthest || busy} onClick={() => setStep(index)}><span className="flow-step-number">{index < step ? '✓' : String(index + 1).padStart(2, '0')}</span><span>{label}</span></button></li>)}</ol></nav>

    {step === 0 && <section aria-labelledby="step-heading">
      <div className="flow-intro"><span className="eyebrow">STEP 01 · THE REQUEST</span><h1 ref={heading} tabIndex={-1} id="step-heading">한 건의 결제 판단을,<br />증거로 따라가 보세요.</h1><p>먼저 Agent가 요청한 금액과 기업이 정한 한도를 확인합니다.</p></div>
      <div className="flow-card request-comparison">
        <div className="request-side"><span className="field-label">AGENT REQUEST</span><span className="flow-amount">{requestAmount}<small>USDC</small></span><p>Agent가 결제를 요청했습니다.</p><span className="mono request-reference">{bundle.request.request_id}</span></div>
        <div className="comparison-divider" aria-hidden="true"><span>→</span></div>
        <div className="policy-side"><span className="field-label">ENTERPRISE POLICY</span><span className="flow-amount">{limit}<small>USDC</small></span><p>기업의 1회 결제 한도입니다.</p><span className="request-reference">적용 정책 · v{bundle.policy.version}</span></div>
        <div className="request-route"><span>Agent</span><span aria-hidden="true">→</span><strong>Verification Layer <span>요청 관측</span></strong><span aria-hidden="true">→</span><span>Institution Wallet</span></div>
      </div>
      <dl className="record-times" aria-label="요청과 정책 시각">
        <div><dt>요청 생성 시각</dt><dd><time dateTime={bundle.request.created_at}>{utc(Date.parse(bundle.request.created_at) / 1000)}</time></dd></div>
        <div><dt>정책 적용 시작</dt><dd><time dateTime={bundle.policy.valid_from}>{utc(Date.parse(bundle.policy.valid_from) / 1000)}</time></dd></div>
      </dl>
      {mock && <p className="timestamp-note">데모에 저장된 예시 시각입니다. 모든 시각은 UTC 기준입니다.</p>}
      <div className="flow-actions"><p>이 요청에 기관은 어떤 판단을 내렸을까요?</p><button className="primary-button" onClick={() => advance(1)}>기관의 판단 보기 <span aria-hidden="true">→</span></button></div>
    </section>}

    {step === 1 && <section aria-labelledby="step-heading">
      <div className="flow-intro"><span className="eyebrow">STEP 02 · THE DECISION</span><h1 ref={heading} tabIndex={-1} id="step-heading">{!bundle.decision ? '기관의 결정이 아직 없습니다.' : rejected ? '기관은 요청을 거절했습니다.' : '기관은 요청을 승인했습니다.'}</h1><p>{bundle.decision ? '기록된 판단과 그 이유를 살펴봅니다. 증거의 검증은 다음 단계에서 진행합니다.' : '요청은 관측됐습니다. 다음 단계에서 결정 기한과 기록 누락 여부를 확인합니다.'}</p></div>
      <div className="flow-card decision-focus">
        <div className="decision-context"><span>{requestAmount} USDC 요청</span><span aria-hidden="true">→</span><span>1회 한도 {limit} USDC</span></div>
        <span className="field-label">INSTITUTION DECISION</span>
        <div className="decision-word">{bundle.decision?.decision ?? 'NO DECISION'}<span>{bundle.decision ? rejected ? '결제 거절' : '결제 승인' : '결정 기록 없음'}</span></div>
        <div className="decision-explanation"><h2>{bundle.decision?.reason_code === 'LIMIT_EXCEEDED' ? '1회 결제 한도를 초과했습니다.' : bundle.decision?.reason_code === 'KYT_RISK' ? '현재 기록에는 다른 거절 사유가 남아 있습니다.' : !bundle.decision ? 'Decision Record가 아직 남지 않았습니다.' : '기관이 남긴 판단을 확인했습니다.'}</h2><code>{bundle.decision?.reason_code ?? '—'}</code></div>
        {detail.change && <div className="change-comparison"><div><span className="field-label">기존 사유</span><code>{detail.change.before}</code></div><span aria-hidden="true">→</span><div><span className="field-label">현재 사유</span><code>{detail.change.after}</code></div></div>}
        {!bundle.decision && <p className="context-note">결정 기한 {utc(bundle.verification_receipt.decision_deadline)} · {mock ? '모의 Chain Time' : 'Chain Time'} 기준</p>}
        {!detail.institutionRecordPresent && bundle.decision && <p className="context-note">기관 DB에는 현재 기록이 없습니다. 이 판단은 이전에 확보한 Evidence Bundle에 남아 있습니다.</p>}
      </div>
      <dl className="record-times" aria-label="요청 관측과 결정 기한">
        <div><dt>요청 관측 시각</dt><dd><time dateTime={new Date(bundle.verification_receipt.observed_at * 1000).toISOString()}>{utc(bundle.verification_receipt.observed_at)}</time></dd></div>
        <div><dt>결정 제출 기한</dt><dd><time dateTime={new Date(bundle.verification_receipt.decision_deadline * 1000).toISOString()}>{utc(bundle.verification_receipt.decision_deadline)}</time></dd></div>
      </dl>
      <p className="timestamp-note">{mock ? '모의 관측 시각 · UTC 기준. ' : 'UTC 기준. '}Decision Record에는 판단 생성 시각이 포함되어 있지 않습니다.</p>
      <div className="flow-actions"><button className="text-button" onClick={() => setStep(0)}>← 요청 다시 보기</button><button className="primary-button" onClick={() => void verify()}>판단의 증거 검증하기 <span aria-hidden="true">→</span></button></div>
      <p className="flow-transition-note">판단이 존재하는 것과, 그 판단의 증거를 신뢰할 수 있는 것은 별개입니다.</p>
    </section>}

    {step === 2 && <section aria-labelledby="step-heading">
      <div className="flow-intro"><span className="eyebrow">STEP 03 · THE EVIDENCE</span><h1 ref={heading} tabIndex={-1} id="step-heading">판단의 근거를 확인합니다.</h1><p>요청, 정책, 기관의 결정과 보관된 증거가 서로 일치하는지 확인합니다.</p></div>
      {busy && <div className="flow-card verification-loading" role="status"><span className="verification-loader" aria-hidden="true" /><h2>증거를 확인하고 있습니다.</h2><p>요청 → 정책 → 판단 → 기록의 무결성</p></div>}
      {error && <div className="error-message" role="alert">{error}<button onClick={() => void verify()}>다시 시도</button></div>}
      {result?.kind === 'unsupported' && <div className="context-note" role="status">{result.message}</div>}
      {result?.kind === 'report' && <>
        <div className="flow-card result-focus">
          <div className="result-heading"><span className={`result-symbol text-${result.report.status.toLowerCase()}`} aria-hidden="true">{result.report.status === 'VERIFIED' ? '✓' : result.report.status === 'PROCESSING' ? '◷' : '!'}</span><div><StatusBadge status={result.report.status} /><h2>{result.report.status === 'VERIFIED' ? '판단의 증거가 확인됐습니다.' : result.report.status === 'PROCESSING' ? '아직 결정 기한 이내입니다.' : result.report.status === 'MISSING' ? '기한 내 결정 기록이 없습니다.' : result.report.status === 'TAMPERED' ? '기록이 당시 증거와 다릅니다.' : '공식 증거로 인정할 수 없습니다.'}</h2><p>{statusDescriptions[result.report.status]}</p></div></div>
          <CheckSummary checks={result.report.checks} />
          <details className="all-checks"><summary>전체 검증 항목 보기 <span>{result.report.checks.length}</span></summary><VerificationChecklist checks={result.report.checks} /></details>
        </div>
        {result.report.status === 'VERIFIED' && <p className="flow-result-note">{bundle.decision?.decision === 'REJECT' ? '결제는 거절됐지만, 그 판단의 증거는 검증됐습니다.' : 'VERIFIED는 실제 결제 실행이 아니라 증거의 검증 상태입니다.'}{mock && ' 이 결과는 Mock 시뮬레이션입니다.'}</p>}
        {result.report.status === 'PROCESSING' && <div className="context-note">확인 당시 결과입니다. 기한이 지난 뒤 다시 확인해 주세요.<button className="text-button" onClick={() => void verify()}>검증 결과 다시 확인 →</button></div>}
        {!detail.institutionRecordPresent && bundle.decision && <p className="context-note">현재 기관 DB에 기록이 없어도 보관된 Evidence로 과거 판단을 확인합니다. 삭제 행위 자체를 증명하지 않습니다.</p>}
        <div className="flow-actions"><button className="text-button" onClick={() => setStep(1)}>← 판단 다시 보기</button><button className="primary-button" disabled={downloading} onClick={onDownload}>{downloading ? '준비 중…' : '증거 파일 다운로드'} <span aria-hidden="true">↓</span></button></div>
        <div className="flow-next"><div><span className="eyebrow">WHAT'S NEXT</span><h3>다른 상황에서도 확인해 보세요.</h3><p>기록 변조, 결정 누락, 기관 DB 삭제를 비교할 수 있습니다.</p></div><button onClick={onDemo}>다른 시나리오 살펴보기 →</button></div>
        <button className="technical-toggle text-button" aria-expanded={technical} aria-controls="technical-records" onClick={() => setTechnical(value => !value)}>{technical ? '기술 증거 접기 −' : '기술 증거 자세히 보기 +'}<span>Timeline · Hash · Signature · Raw JSON</span></button>
        {technical && <div className="technical-workspace" id="technical-records"><EvidenceTimeline detail={detail} selected={evidence} onSelect={setEvidence} /><EvidenceDetail detail={detail} selected={evidence} mock={mock} /></div>}
      </>}
      {!busy && (error || result?.kind === 'unsupported') && <button className="text-button" onClick={() => setStep(1)}>← 판단으로 돌아가기</button>}
    </section>}
  </>;
}
