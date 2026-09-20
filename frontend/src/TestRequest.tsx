import { useRef, useState, type Ref } from 'react';
import type { DemoRun } from './data/types.ts';
import { testAmountBaseUnits } from './data/testAmount.ts';
import { RunProgress } from './RunProgress.tsx';
import './test-request.css';

export function TestRequest({ headingRef, busy, run, onSubmit, onOpen }: {
  headingRef?: Ref<HTMLHeadingElement>; busy: boolean; run: DemoRun | null;
  onSubmit: (amount: string, policyTamper: boolean) => Promise<string | undefined>; onOpen: (id: string) => void;
}) {
  const [amount, setAmount] = useState('3500');
  const [policyTamper, setPolicyTamper] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current || busy || run?.status === 'running') return;
    setError(null);
    let units: string;
    try { units = testAmountBaseUnits(amount); }
    catch (cause) { setError((cause as Error).message); return; }
    if (policyTamper && (BigInt(units) <= 3000000000n || BigInt(units) >= 4000000000n)) {
      setError('정책 변조 사례는 3,000 USDC 초과, 4,000 USDC 미만으로 요청해 주세요.');
      return;
    }
    lock.current = true;
    setCompletedId(null);
    try { setCompletedId(await onSubmit(units, policyTamper) ?? null); }
    catch { setError('요청 처리 상태를 확인할 수 없습니다. 목록에서 접수 여부를 확인해 주세요.'); }
    finally { lock.current = false; }
  };
  return <section className="test-request" aria-labelledby="test-request-heading">
    <div className="flow-intro"><span className="eyebrow">TEST REQUEST</span><h1 id="test-request-heading" ref={headingRef} tabIndex={-1}>테스트 요청</h1></div>
    <form className="flow-card test-request-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor="test-amount">요청 금액 <span>USDC</span></label>
      <input id="test-amount" inputMode="decimal" autoComplete="off" maxLength={32} value={amount} disabled={busy || run?.status === 'running'} onChange={event => setAmount(event.target.value)} aria-invalid={!!error} aria-describedby={error ? 'test-amount-error test-request-note' : 'test-request-note'} />
      <p id="test-request-note">거절 사례를 테스트합니다. 한도 초과는 LIMIT_EXCEEDED, 한도 이내는 KYT_RISK로 응답합니다. 실제 송금 없이 테스트 ETH로 증거를 기록합니다.</p>
      <label className="test-policy-option"><input type="checkbox" checked={policyTamper} disabled={busy || run?.status === 'running'} onChange={event => setPolicyTamper(event.target.checked)} /><span>거절 후 정책 한도 축소 조작 (4,000 → 3,000 USDC)</span></label>
      {policyTamper && <p>예: 3,500 USDC 요청은 당시 한도 4,000 이내입니다. 기관이 거절한 뒤 정책을 3,000으로 낮추고 사유도 LIMIT_EXCEEDED로 바꿔 제시합니다. 원본 서명·온체인 기록과 비교해 조작을 검출합니다. 3,000 초과, 4,000 미만 금액으로 실행해 주세요.</p>}
      {error && <p id="test-amount-error" role="alert" className="error-message">{error}</p>}
      <button className="primary-button" disabled={busy || run?.status === 'running'} type="submit">{busy ? '요청 처리 중…' : 'Agent 요청 보내기 →'}</button>
    </form>
    {run && <RunProgress run={run} displayId="테스트 요청 처리 과정" />}
    {completedId && run?.decision === 'REJECT' && <p className="context-note" role="status">거절 · {run.scenario === 'tampered' ? '정책 기록 변조' : run.reasonCode === 'LIMIT_EXCEEDED' ? '한도 초과 거절' : '알 수 없는 거절'}. 거절 사건 목록에 저장했습니다.</p>}
    {completedId && <div className="flow-actions"><button className="primary-button" onClick={() => onOpen(completedId)}>요청·응답 비교하기 →</button></div>}
    {!busy && run?.status === 'failed' && <p className="context-note">실패 이전에 생성된 기록은 보존됩니다. 새 요청을 보내기 전에 사건 목록을 확인해 주세요.</p>}
  </section>;
}
