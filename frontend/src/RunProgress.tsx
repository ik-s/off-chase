import type { DemoRun } from './data/types.ts';
const labels: Record<string, string> = {
  agent_signed: 'Agent 요청 생성·서명', gateway_received: 'Gateway 요청 수신', request_validated: '요청·정책 검사 완료',
  request_anchored: 'Request Anchor 확정', receipt_saved: '접수 증거 저장', institution_dispatched: '모의 기관에 요청 전달',
  response_received: '기관의 서명된 응답 수신', decision_anchored_and_saved: 'Decision Anchor·증거 저장 완료', policy_copy_altered: '비교용 정책 사본 변경',
};
export function RunProgress({ run, displayId }: { run: DemoRun; displayId?: string }) {
  return <section className="flow-card run-progress" aria-label="실제 요청 처리 기록" aria-live="polite">
    <h2>요청 처리 기록</h2><p>{displayId ?? run.requestId}</p>
    <ol className="run-events">{run.events.map((event, i) => <li key={`${event.stage}-${i}`}><strong>{labels[event.stage] ?? event.stage}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleString('ko-KR', { timeZone: 'UTC' })} UTC</time></li>)}</ol>
    <p>{run.status === 'running' ? '실제 서버·체인 처리를 기다리고 있습니다…' : run.status === 'failed' ? `처리 실패: ${run.error}` : run.scenario === 'missing' ? '요청 증거 저장 완료 · 기관 응답은 생략한 시나리오입니다.' : '처리 완료'}</p>
    <small>서버 관측 시각입니다. 블록 시각은 증거 상세에서 확인하세요.</small>
  </section>;
}
