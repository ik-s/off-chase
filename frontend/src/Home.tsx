import type { Ref } from 'react';

export function Home({ onStart, headingRef }: { onStart: () => void; headingRef: Ref<HTMLHeadingElement> }) {
  return <section className="home-page" aria-labelledby="home-heading">
    <div className="home-hero">
      <div className="home-message">
        <span className="eyebrow">FOLLOW THE DECISION. FIND THE EVIDENCE.</span>
        <h1 id="home-heading" ref={headingRef} tabIndex={-1}>판단은 오프체인에서.<br /><span>신뢰는 증거에서.</span></h1>
        <p>Agent의 결제 요청이 왜 승인되거나 거절됐는지,<br className="desktop-break" /> 당시의 요청·정책·판단을 연결해 확인합니다.</p>
        <p className="home-description">Off-Chase는 기관의 현재 로그에만 의존하지 않고,<br className="desktop-break" /> 남겨진 증거로 판단의 근거를 추적하는 검증 도구입니다.</p>
        <button className="primary-button home-start" onClick={onStart}>요청 선택하고 시작하기 <span aria-hidden="true">→</span></button>
        <span className="home-start-note">살펴볼 요청을 직접 선택해 주세요.</span>
      </div>
      <div className="home-emblem" aria-hidden="true">
        <span className="emblem-caption">OFF-CHAIN / ON RECORD</span>
        <div className="emblem-orbit"><img src="/off-chase.svg" alt="" /><span className="orbit-dot" /></div>
        <span className="emblem-name">Off-Chase</span>
        <span className="emblem-description">Every decision leaves a trace.</span>
        <div className="emblem-trace"><span>REQUEST</span><i /><span>POLICY</span><i /><span>DECISION</span></div>
      </div>
    </div>
    <section className="home-how" aria-labelledby="how-heading"><div className="home-how-heading"><span className="eyebrow">HOW IT WORKS</span><h2 id="how-heading">하나의 요청을, 세 단계로.</h2></div>
      <ol><li><span className="home-step">01</span><h3>요청 확인</h3><p>요청 금액과 기업의 정책을<br />먼저 살펴봅니다.</p></li><li><span className="home-step">02</span><h3>판단 이해</h3><p>기관이 남긴 결정과<br />그 이유를 확인합니다.</p></li><li><span className="home-step">03</span><h3>증거 검증</h3><p>판단과 기록이 일치하는지<br />근거를 따라 확인합니다.</p></li></ol>
    </section>
  </section>;
}
