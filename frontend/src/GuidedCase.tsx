import { useEffect, useRef, useState } from 'react';
import type { CaseDetail, EvidenceSelection, VerificationOutcome } from './data/types.ts';
import { formatUsdc, statusDescriptions, utc } from './data/presentation.ts';
import { EvidenceTimeline, StatusBadge } from './components.tsx';
import { EvidenceDetail } from './EvidenceDetail.tsx';
import { EvidenceReview } from './EvidenceReview.tsx';

const steps = ['요청 확인', '판단 확인', '증거 검증'];

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
      <div className="flow-intro"><span className="eyebrow">STEP 01</span><h1 ref={heading} tabIndex={-1} id="step-heading">{bundle.request.request_id} · Request</h1></div>
      <div className="flow-card request-comparison">
        <div className="request-side"><span className="field-label">AGENT REQUEST</span><span className="flow-amount">{requestAmount}<small>USDC</small></span><p>요청 금액</p><span className="mono request-reference">{bundle.request.request_id}</span></div>
        <div className="comparison-divider" aria-hidden="true"><span>→</span></div>
        <div className="policy-side"><span className="field-label">ENTERPRISE POLICY</span><span className="flow-amount">{limit}<small>USDC</small></span><p>1회 결제 한도</p><span className="request-reference">적용 정책 · v{bundle.policy.version}</span></div>
        <div className="request-route"><span>Agent</span><span aria-hidden="true">→</span><strong>Verification Layer <span>요청 관측</span></strong><span aria-hidden="true">→</span><span>Institution Wallet</span></div>
      </div>
      <dl className="record-times" aria-label="요청과 정책 시각">
        <div><dt>요청 생성 시각</dt><dd><time dateTime={bundle.request.created_at}>{utc(Date.parse(bundle.request.created_at) / 1000)}</time></dd></div>
        <div><dt>정책 적용 시작</dt><dd><time dateTime={bundle.policy.valid_from}>{utc(Date.parse(bundle.policy.valid_from) / 1000)}</time></dd></div>
      </dl>
      {mock && <p className="timestamp-note">예시 시각 · UTC</p>}
      <div className="flow-actions"><button className="primary-button" onClick={() => advance(1)}>Decision 확인 <span aria-hidden="true">→</span></button></div>
    </section>}

    {step === 1 && <section aria-labelledby="step-heading">
      <div className="flow-intro"><span className="eyebrow">STEP 02</span><h1 ref={heading} tabIndex={-1} id="step-heading">{bundle.request.request_id} · Decision</h1></div>
      <div className="flow-card decision-focus">
        <div className="decision-context"><span>{requestAmount} USDC 요청</span><span aria-hidden="true">→</span><span>1회 한도 {limit} USDC</span></div>
        <span className="field-label">INSTITUTION DECISION</span>
        <div className="decision-word">{bundle.decision?.decision ?? 'NO DECISION'}<span>{bundle.decision ? rejected ? '결제 거절' : '결제 승인' : '결정 기록 없음'}</span></div>
        <div className="decision-explanation"><h2>{bundle.decision?.reason_code === 'LIMIT_EXCEEDED' ? '1회 결제 한도 초과' : bundle.decision?.reason_code === 'KYT_RISK' ? '기록된 사유: KYT 위험' : !bundle.decision ? 'Decision Record 없음' : '기관 판단'}</h2><code>{bundle.decision?.reason_code ?? '—'}</code></div>
        {detail.change && <><div className="change-comparison"><div><span className="field-label">보관된 판단</span><code>{detail.change.before}</code></div><span aria-hidden="true">→</span><div><span className="field-label">현재 기록의 판단</span><code>{detail.change.after}</code></div></div><p className="context-note">한도 이내 요청에 대한 기존 승인을 거절로 바꾼 모의 사례입니다. 요청과 정책, 보관된 Anchor는 그대로입니다.</p></>}
        {!bundle.decision && <p className="context-note">결정 기한 {utc(bundle.verification_receipt.decision_deadline)} · {mock ? '모의 Chain Time' : 'Chain Time'} 기준</p>}
        {!detail.institutionRecordPresent && bundle.decision && <p className="context-note">기관 DB에는 현재 기록이 없습니다. 이 판단은 이전에 확보한 Evidence Bundle에 남아 있습니다.</p>}
      </div>
      <dl className="record-times" aria-label="요청 관측과 결정 기한">
        <div><dt>요청 관측 시각</dt><dd><time dateTime={new Date(bundle.verification_receipt.observed_at * 1000).toISOString()}>{utc(bundle.verification_receipt.observed_at)}</time></dd></div>
        <div><dt>결정 제출 기한</dt><dd><time dateTime={new Date(bundle.verification_receipt.decision_deadline * 1000).toISOString()}>{utc(bundle.verification_receipt.decision_deadline)}</time></dd></div>
      </dl>
      <p className="timestamp-note">{mock ? '모의 시각 · UTC' : 'UTC'} · 판단 생성 시각 미제공</p>
      <div className="flow-actions"><button className="text-button" onClick={() => setStep(0)}>← 요청 확인</button><button className="primary-button" onClick={() => void verify()}>증거 검증 <span aria-hidden="true">→</span></button></div>
    </section>}

    {step === 2 && <section aria-labelledby="step-heading">
      <div className="flow-intro"><span className="eyebrow">STEP 03</span><h1 ref={heading} tabIndex={-1} id="step-heading">{bundle.request.request_id} · Evidence</h1></div>
      {busy && <div className="flow-card verification-loading" role="status"><span className="verification-loader" aria-hidden="true" /><h2>증거를 확인하고 있습니다.</h2><p>요청 → 정책 → 판단 → 기록의 무결성</p></div>}
      {error && <div className="error-message" role="alert">{error}<button onClick={() => void verify()}>다시 시도</button></div>}
      {result?.kind === 'unsupported' && <div className="context-note" role="status">{result.message}</div>}
      {result?.kind === 'report' && <>
        <div className="flow-card result-focus">
          <div className="result-heading"><span className={`result-symbol text-${result.report.status.toLowerCase()}`} aria-hidden="true">{result.report.status === 'VERIFIED' ? '✓' : result.report.status === 'PROCESSING' ? '◷' : '!'}</span><div><StatusBadge status={result.report.status} /><h2>{result.report.status === 'VERIFIED' ? '증거 검증 완료' : result.report.status === 'PROCESSING' ? '결정 대기' : result.report.status === 'MISSING' ? '결정 기록 누락' : result.report.status === 'TAMPERED' ? '기록 불일치' : '유효하지 않은 증거'}</h2><p>{statusDescriptions[result.report.status]}</p></div></div>
          <EvidenceReview detail={detail} report={result.report} mock={mock} />
        </div>
        {result.report.status === 'VERIFIED' && <p className="flow-result-note">{bundle.decision?.decision === 'REJECT' ? '결제는 거절됐지만, 그 판단의 증거는 검증됐습니다.' : 'VERIFIED는 실제 결제 실행이 아니라 증거의 검증 상태입니다.'}{mock && ' 이 결과는 Mock 시뮬레이션입니다.'}</p>}
        {result.report.status === 'PROCESSING' && <div className="context-note">확인 당시 결과입니다. 기한이 지난 뒤 다시 확인해 주세요.<button className="text-button" onClick={() => void verify()}>검증 결과 다시 확인 →</button></div>}
        {!detail.institutionRecordPresent && bundle.decision && <p className="context-note">현재 기관 DB에 기록이 없어도 보관된 Evidence로 과거 판단을 확인합니다. 삭제 행위 자체를 증명하지 않습니다.</p>}
        <div className="flow-actions"><button className="text-button" onClick={() => setStep(1)}>← 판단 다시 보기</button><button className="primary-button" disabled={downloading} onClick={onDownload}>{downloading ? '준비 중…' : '증거 파일 다운로드'} <span aria-hidden="true">↓</span></button></div>
        <div className="flow-next"><div><span className="eyebrow">DEMO</span><h3>시나리오 비교</h3></div><button onClick={onDemo}>Demo Controls →</button></div>
        <button className="technical-toggle text-button" aria-expanded={technical} aria-controls="technical-records" onClick={() => setTechnical(value => !value)}>{technical ? '기술 증거 접기 −' : '기술 증거 자세히 보기 +'}<span>Timeline · Hash · Signature · Raw JSON</span></button>
        {technical && <div className="technical-workspace" id="technical-records"><EvidenceTimeline detail={detail} selected={evidence} onSelect={setEvidence} /><EvidenceDetail detail={detail} selected={evidence} mock={mock} /></div>}
      </>}
      {!busy && (error || result?.kind === 'unsupported') && <button className="text-button" onClick={() => setStep(1)}>← 판단으로 돌아가기</button>}
    </section>}
  </>;
}
