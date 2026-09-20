import { TechnicalValue, ExplorerLinks } from './TechnicalValue.tsx';
import { formatUsdc, utc } from './data/presentation.ts';
import type { CaseDetail, EvidenceSelection } from './data/types.ts';
import { evidenceLabels, StatusBadge, VerificationChecklist } from './components.tsx';

function Fields({ values }: { values: [string, string][] }) {
  return <dl className="detail-fields">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{/^(0x|REQ-)/.test(value) && value.length > 32 ? <TechnicalValue key={value} value={value} label={label} /> : value}</dd></div>)}</dl>;
}
export function RawJsonViewer({ record }: { record: unknown }) {
  return <details className="disclosure"><summary>View Raw Record <span>JSON</span></summary><pre tabIndex={0}>{JSON.stringify(record, null, 2)}</pre></details>;
}
export function OnchainEvidence({ detail, mock }: { detail: CaseDetail; mock: boolean }) {
  const { bundle, requestAnchor, decisionAnchor } = detail;
  return <details className="disclosure" id="onchain-evidence"><summary>On-chain Evidence 보기 <span>↗</span></summary><div className="disclosure-content">
    <p className="context-note">{mock ? '아래 주소·Hash·Tx는 예시 값입니다. 실제 Explorer 링크는 제공하지 않습니다.' : '외부 Anchor의 기록과 비교한 결과입니다.'}</p>
    <Fields values={[
      ['Network', `${bundle.anchors.chain_id === 11155111 ? 'Sepolia' : 'Configured chain'} · ${bundle.anchors.chain_id}`],
      ['Contract Address', bundle.anchors.contract_address],
      ['Request Transaction', bundle.anchors.request_tx],
      ['Request Block', `#${requestAnchor.block}`],
      ['Request Recorded At', utc(requestAnchor.timestamp)],
      ['Request Hash', requestAnchor.hash],
      ['Policy Hash', requestAnchor.policyHash],
      ['Decision Transaction', bundle.anchors.decision_tx ?? '없음'],
      ['Decision Block', decisionAnchor?.block != null ? `#${decisionAnchor.block}` : '미제공'],
      ['Decision Recorded At', decisionAnchor ? utc(decisionAnchor.timestamp) : '없음'],
      ['Decision Hash', decisionAnchor?.hash ?? '없음'],
    ]} />
    <ExplorerLinks anchors={bundle.anchors} mock={mock} />
  </div></details>;
}

export function EvidenceDetail({ detail, selected, mock }: { detail: CaseDetail; selected: EvidenceSelection; mock: boolean }) {
  const { bundle, report } = detail;
  const record = bundle[selected];
  const fields: Record<EvidenceSelection, [string, string][]> = {
    policy: [['Policy', bundle.policy.policy_id], ['1회 결제 한도', `${formatUsdc(bundle.policy.max_amount_base_units)} USDC`], ['Version', `v${bundle.policy.version}`], ['Valid From', bundle.policy.valid_from]],
    request: [['Request', detail.displayId ?? bundle.request.request_id], ['요청 금액', `${formatUsdc(bundle.request.amount_base_units)} USDC`], ['Policy', bundle.request.policy_id], ['Created At', bundle.request.created_at]],
    verification_receipt: [['Request Reference', bundle.verification_receipt.request_id === bundle.request.request_id ? detail.displayId ?? bundle.request.request_id : bundle.verification_receipt.request_id], ['Gateway', 'Request Observed'], ['Observed At', utc(bundle.verification_receipt.observed_at)], ['Decision Deadline', utc(bundle.verification_receipt.decision_deadline)], ['Chain Time' + (mock ? ' (모의)' : ''), utc(detail.chainTime)]],
    decision: [['Decision', bundle.decision?.decision === 'REJECT' ? '거절 · REJECT' : bundle.decision?.decision === 'APPROVE' ? '승인 · APPROVE' : '결정 없음'], ['Reason', bundle.decision?.reason_code ?? '—'], ['Request Reference', detail.displayId ?? bundle.request.request_id], ['Policy', bundle.policy.policy_id]],
    anchors: [['Network', String(bundle.anchors.chain_id)], ['Request Anchor', detail.requestAnchor.hash ? '존재' : '없음'], ['Decision Anchor', detail.decisionAnchor ? '존재' : '없음'], ['Decision Deadline', utc(bundle.verification_receipt.decision_deadline)]],
  };
  const technical = record ? Object.entries(record).filter(([key]) => /hash|signature|key_id|nonce|recipient|request_id/.test(key)) : [];
  const checks = report.checks.filter(check => check.records.includes(selected));
  return <div key={`${bundle.request.request_id}-${selected}`} id="evidence-detail" tabIndex={-1}>
    <div className="column-heading"><div><span className="eyebrow">INSPECT THE RECORD</span><h2>Evidence Detail</h2></div><span className="detail-icon" aria-hidden="true">⌕</span></div>
    <div className="record-heading"><span className="record-kind">{selected === 'decision' ? '04' : selected === 'policy' ? '01' : selected === 'request' ? '02' : selected === 'verification_receipt' ? '03' : '05'}</span><div><span className="eyebrow">SELECTED EVIDENCE</span><h3>{evidenceLabels[selected]}</h3></div></div>
    <Fields values={fields[selected]} />
    {selected === 'decision' && !bundle.decision && <p className="context-note">Request는 관측됐지만 Decision은 없습니다. 아래 기한 검사에서 대기와 누락을 구분합니다.</p>}
    <section className="verification-section" aria-labelledby="checks-heading"><div className="section-top"><h3 id="checks-heading">Verification Checks</h3><span className="count">{checks.length}</span></div><p className="subdued">{mock ? '선택한 Record의 모의 검증 근거' : '선택한 Record의 검증 근거'}</p><VerificationChecklist checks={checks} /></section>
    <div className="detail-verdict"><span className="field-label">CASE VERIFICATION</span><StatusBadge status={report.status} /></div>
    <div className="technical-section"><span className="eyebrow">TECHNICAL EVIDENCE</span>
      {technical.length > 0 && <details className="disclosure"><summary>Hash &amp; Signature 보기 <span>+</span></summary><div className="disclosure-content"><Fields values={technical.map(([key, value]) => [key, String(value)])} /></div></details>}
      <OnchainEvidence detail={detail} mock={mock} />
      <RawJsonViewer record={record} />
    </div>
  </div>;
}
