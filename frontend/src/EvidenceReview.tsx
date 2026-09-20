import { TechnicalValue, ExplorerLinks } from './TechnicalValue.tsx';
import type { ReactNode } from 'react';
import type { CaseDetail, VerificationCheckViewModel, VerificationReportViewModel } from './data/types.ts';
import { formatUsdc, utc } from './data/presentation.ts';
import './evidence-review.css';

const checkNames: Record<string, string> = {
  schema: '요청·정책·응답 파일의 필수 정보',
  key: '등록된 발신자의 키인지 확인',
  'agent-signature': 'AI Agent가 서명한 요청인지 확인',
  'receipt-signature': '검증 계층이 서명한 접수 기록인지 확인',
  'receipt-time': '접수 시각과 결정 기한이 블록 기록과 일치하는지 확인',
  'request-hash': '접수된 요청과 보관된 요청의 해시 비교',
  'request-anchor': '요청의 온체인 등록 기록 확인',
  'policy-signature': '기업이 서명한 정책인지 확인',
  'policy-hash': '요청과 응답이 같은 정책을 참조하는지 확인',
  'policy-anchor': '제시된 정책과 요청 당시 온체인 정책 해시 비교',
  'institution-signature': '금융기관이 서명한 응답인지 확인',
  references: '기관의 응답이 이 요청에 대한 것인지 확인',
  policy: '응답의 판단·사유가 기업 정책과 일치하는지 확인',
  'decision-hash': '응답 내용과 기존에 보관된 해시 비교',
  anchor: '응답과 온체인 등록 증거의 일치 여부',
  deadline: '결정 기한 내 응답 기록 여부',
};
const requestChecks = ['schema', 'key', 'agent-signature', 'receipt-signature', 'receipt-time', 'request-hash', 'request-anchor'];
const policyChecks = ['policy-signature', 'policy-hash', 'policy-anchor'];
const responseChecks = ['institution-signature', 'references', 'policy', 'decision-hash', 'anchor', 'deadline'];

function Facts({ values }: { values: [string, string][] }) {
  return <dl className="evidence-facts">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function TechnicalValues({ values }: { values: [string, string][] }) {
  return <dl className="evidence-values">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><TechnicalValue key={value} value={value} label={label} /></dd></div>)}</dl>;
}

function EvidenceSection({ title, description, ids, report, children, absent = false }: {
  title: string; description: string; ids: string[]; report: VerificationReportViewModel; children: ReactNode; absent?: boolean;
}) {
  const checks: VerificationCheckViewModel[] = ids.map(id => report.checks.find(check => check.id === id) ?? {
    id, label: checkNames[id] ?? id, state: 'not-run', detail: '이 항목의 검증 결과가 제공되지 않았습니다.', records: [],
  });
  const failed = checks.some(check => check.state === 'failed');
  const excluded = checks.some(check => check.state === 'not-applicable');
  const passed = !absent && checks.every(check => check.state === 'passed' || check.state === 'not-applicable');
  const state = failed ? 'failed' : passed ? 'passed' : 'pending';
  const label = failed ? '확인 필요' : absent ? '응답 없음' : passed ? excluded ? '증거 확인 · 사유 판단 제외' : '확인됨' : '확인 대기';
  return <details className={`evidence-section evidence-${state}`}>
    <summary><span className="evidence-section-copy"><strong>{title}</strong><span>{description}</span></span><span className="evidence-section-status">{label}</span><svg className="evidence-expand" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 9 6 6 6-6" /></svg></summary>
    <div className="evidence-section-body">
      {children}
      <h4>이 증거에서 확인한 내용</h4>
      <ul className="evidence-check-results">{checks.map(check => <li key={check.id} className={`check-${check.state}`}>
        <div><span>{checkNames[check.id] ?? check.label}</span><strong>{{ passed: '통과', failed: '실패', 'not-run': '미실행', 'not-applicable': '해당 없음' }[check.state]}</strong></div>
        {check.state !== 'passed' && <p>{check.detail}</p>}{check.error && <code>{check.error}</code>}
      </li>)}</ul>
    </div>
  </details>;
}

export function EvidenceReview({ detail, report, mock }: { detail: CaseDetail; report: VerificationReportViewModel; mock: boolean }) {
  const { policy, request, verification_receipt: receipt, decision, anchors } = detail.bundle;
  const amount = formatUsdc(request.amount_base_units);
  const limit = formatUsdc(policy.max_amount_base_units);
  const reason = !decision ? '응답이 없어 사유를 확인할 수 없습니다.'
    : decision.reason_code === 'LIMIT_EXCEEDED' ? `기록된 거절 사유는 1회 결제 한도 초과입니다. 요청 ${amount} USDC / 한도 ${limit} USDC.`
    : decision.reason_code === 'KYT_RISK' ? '기록된 거절 사유는 거래 위험(KYT)입니다. 구체적인 위험 근거는 이 기록에 포함되어 있지 않습니다.'
    : `기관이 기록한 사유: ${decision.reason_code}`;
  return <div className="evidence-review">
    <section className="evidence-case-summary" aria-labelledby="evidence-case-heading">
      <h3 id="evidence-case-heading">이 요청에 어떤 응답이 왔나요?</h3>
      <dl className="evidence-response-strip">
        <div><dt>AI Agent의 결제 요청</dt><dd>{amount} <small>USDC</small></dd></div>
        <div><dt>{detail.change ? '사후 제시된 정책 한도' : '기업의 1회 결제 한도'}</dt><dd>{limit} <small>USDC</small></dd></div>
        <div><dt>기록된 기관 응답</dt><dd>{decision ? decision.decision === 'REJECT' ? '거절' : '승인' : '응답 없음'}</dd><span>{decision?.decision ?? 'NO DECISION'}</span></div>
      </dl>
      <p className="evidence-reason">{reason}</p>
      {decision && <span className="evidence-reason-code">{decision.reason_code}</span>}
      {detail.change && <div className="evidence-warning"><strong>요청 당시 정책과 사후 제시된 정책이 다릅니다.</strong><p>{detail.change.before} → {detail.change.after}</p>{decision?.reason_code === 'KYT_RISK' && <p>요청 {amount} USDC는 당시 한도 {formatUsdc((detail.originalBundle ?? detail.bundle).policy.max_amount_base_units)} USDC를 충족했지만 기관이 거절했습니다. 사후에 높인 한도로도 금액 초과 거절을 설명할 수 없습니다.</p>}<p>원본 요청·기관 응답·Anchor는 보존되어 있습니다. 사후 제시된 정책의 해시가 당시 기록과 일치하지 않습니다.</p></div>}
      {decision?.reason_code === 'KYT_RISK' && <p className="context-note">VERIFIED는 기관이 이 응답에 서명했고 기록이 일치한다는 뜻입니다. 구체적인 위험 근거나 거절의 타당성을 보증하지 않습니다.</p>}
      {(report.status === 'INVALID' || report.status === 'TAMPERED') && <p className="evidence-warning">위 내용은 제출된 기록의 주장입니다. 검증에 실패한 근거를 아래에서 확인하세요.</p>}
      {!decision && <p className="evidence-reason">결정 제출 기한 {utc(receipt.decision_deadline)} · {report.status === 'MISSING' ? '기한이 지났지만 결정 기록이 없습니다.' : report.status === 'PROCESSING' ? '검증 당시 아직 기한 이내입니다.' : '검증 결과를 확인하세요.'} 한도 이내 요청이어도 기관의 실제 승인 응답이 있어야 하며, 응답 없음은 거절을 뜻하지 않습니다.</p>}
      {!detail.institutionRecordPresent && decision && <p className="evidence-reason">기관 DB에는 현재 기록이 없으며, 보관된 증거 파일에서 응답을 확인했습니다.</p>}
    </section>
    <ExplorerLinks anchors={anchors} mock={mock} />
    <div className="evidence-review-heading"><h3>요청과 응답의 근거</h3><p>항목을 펼치면 원문 값과 검증 결과를 볼 수 있습니다.{mock && ' 서명·해시·Tx는 모의 예시 값입니다.'}</p></div>
    <EvidenceSection title="AI Agent가 보낸 결제 요청" description={`${amount} USDC 요청 · 요청자와 접수 기록 확인`} ids={requestChecks} report={report}>
      <Facts values={[[ '사건 번호', detail.displayId ?? request.request_id ], ['요청 금액', `${amount} USDC`], ['요청 생성 시각', request.created_at], ['검증 계층의 접수 시각', utc(receipt.observed_at)]]} />
      <p className="evidence-explanation">Agent의 서명과 검증 계층의 접수 기록을 확인합니다. 키 ID는 등록 식별자이며 공개키 원문은 이 파일에 포함되지 않습니다.</p>
      <TechnicalValues values={[
        ['원본 요청 ID', request.request_id], ['결제 수신 주소', request.recipient], ['AI Agent 키 ID', request.agent_key_id], ['AI Agent의 요청 서명', request.agent_signature],
        ['접수 기록의 요청 해시', receipt.request_hash], ['온체인에 보관된 요청 해시', detail.requestAnchor.hash],
        ['접수 기록 서명자 키 ID', receipt.verification_key_id], ['검증 계층의 접수 서명', receipt.verification_signature], ['요청 등록 Tx', receipt.request_anchor_tx],
      ]} />
    </EvidenceSection>
    <EvidenceSection title="결제에 적용된 기업 정책" description={`1회 한도 ${limit} USDC · 기업 서명과 정책 연결 확인`} ids={policyChecks} report={report}>
      <Facts values={[[ '정책 ID', policy.policy_id ], ['정책 버전', String(policy.version)], ['1회 결제 한도', `${limit} USDC`], ['정책 적용 시작', policy.valid_from]]} />
      <p className="evidence-explanation">기업이 서명한 정책과 요청·응답에 연결된 정책 해시를 확인합니다.</p>
      <TechnicalValues values={[
        ['기업 키 ID', policy.enterprise_key_id], ['기업의 정책 서명', policy.enterprise_signature],
        ['요청이 참조한 정책 해시', request.policy_hash], ['접수 기록의 정책 해시', receipt.policy_hash], ['기관 응답의 정책 해시', decision?.policy_hash ?? '응답 없음'],
      ]} />
    </EvidenceSection>
    <EvidenceSection title="금융기관의 응답과 거절·승인 근거" description={decision ? `${decision.decision} · ${decision.reason_code} · 응답 서명과 보관 기록 비교` : '기관 응답 없음 · 결정 기한과 기록 누락 확인'} ids={responseChecks} report={report} absent={!decision}>
      <Facts values={[[ '기관 응답', decision?.decision ?? '없음' ], ['기록된 판단 사유', decision?.reason_code ?? '없음'], ['응답이 참조한 요청', decision?.request_id === request.request_id ? detail.displayId ?? request.request_id : decision?.request_id ?? '응답 없음'], ['결정 제출 기한', utc(receipt.decision_deadline)], ['응답의 온체인 등록 시각', detail.decisionAnchor ? utc(detail.decisionAnchor.timestamp) : '등록 기록 없음']]} />
      <p className="evidence-explanation">기관의 서명, 요청 연결, 정책에 맞는 사유인지와 기존 등록 증거의 일치 여부를 확인합니다. 등록 시각은 판단 생성 시각과 다릅니다.</p>
      {decision ? <TechnicalValues values={[
        ['금융기관 키 ID', decision.institution_key_id], ['금융기관의 응답 서명', decision.institution_signature], ['응답이 참조한 요청 해시', decision.request_hash],
        ['기존에 보관된 응답 해시', detail.decisionAnchor?.hash ?? '등록 기록 없음'], ['응답 등록 Tx', anchors.decision_tx ?? '등록 기록 없음'],
      ]} /> : <p className="evidence-explanation">응답이 없어 기관 서명과 응답 해시는 제공되지 않습니다.</p>}
    </EvidenceSection>
  </div>;
}
