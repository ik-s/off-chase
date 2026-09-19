import type { Ref } from 'react';

export function Home({ onStart, headingRef }: { onStart: () => void; headingRef: Ref<HTMLHeadingElement> }) {
  return <section className="home-page" aria-labelledby="home-heading">
    <div className="home-hero">
      <div className="home-message">
        <span className="eyebrow">FOLLOW THE DECISION. FIND THE EVIDENCE.</span>
        <h1 id="home-heading" ref={headingRef} tabIndex={-1}>판단은 오프체인에서.<br /><span>신뢰는 증거에서.</span></h1>
        <p>결제 요청에 적용된 정책, 기관의 판단과 검증 증거를 확인합니다.</p>
        <button className="primary-button home-start" onClick={onStart}>요청 선택하고 시작하기 <span aria-hidden="true">→</span></button>
      </div>
      <div className="home-emblem" aria-hidden="true">
        <span className="emblem-caption">OFF-CHAIN / ON RECORD</span>
        <div className="emblem-orbit"><img src="/off-chase.svg" alt="" /><span className="orbit-dot" /></div>
        <span className="emblem-name">Off-Chase</span>
        <span className="emblem-description">Every decision leaves a trace.</span>
        <div className="emblem-trace"><span>REQUEST</span><i /><span>POLICY</span><i /><span>DECISION</span></div>
      </div>
    </div>
    <section className="home-how" aria-labelledby="how-heading"><div className="home-how-heading"><span className="eyebrow">WORKFLOW</span><h2 id="how-heading">검증 흐름</h2></div>
      <ol><li><span className="home-step">01</span><h3>요청 확인</h3></li><li><span className="home-step">02</span><h3>판단 확인</h3></li><li><span className="home-step">03</span><h3>증거 검증</h3></li></ol>
    </section>
  </section>;
}
