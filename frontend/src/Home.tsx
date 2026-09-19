import type { Ref } from 'react';

export function Home({ onStart, headingRef }: { onStart: () => void; headingRef: Ref<HTMLHeadingElement> }) {
  return <section className="audit-home" aria-labelledby="home-heading">
    <span className="eyebrow">OFF-CHASE / CASE WORKSPACE</span>
    <h1 id="home-heading" ref={headingRef} tabIndex={-1}>판단은 오프체인에서.<br />신뢰는 증거에서.</h1>
    <p>결제 요청에 적용된 정책, 기관의 판단과 검증 증거를 조사합니다.</p>
    <button className="primary-button" onClick={onStart}>Case List 열기 →</button>
  </section>;
}
