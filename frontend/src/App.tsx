import { useEffect, useRef, useState } from 'react';
import type { CaseFilter, DemoScenario, EvidenceRepository } from './data/types.ts';
import { CaseList, DemoControls, VerificationResult } from './components.tsx';
import { GuidedCase } from './GuidedCase.tsx';
import { Home } from './Home.tsx';
import { useWorkspace } from './useWorkspace.ts';
import './flow.css';
import './branding.css';

export default function App({ repository }: { repository: EvidenceRepository }) {
  const { state, dispatch, refreshList, retryDetail, runDemo, selectFile, verifyFile, download, verifyCase } = useWorkspace(repository);
  const [panel, setPanel] = useState<'home' | 'cases' | 'file' | 'demo' | null>('home');
  const [caseFilter, setCaseFilter] = useState<CaseFilter>('ALL');
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const flowContent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = panel ? panelHeading.current : flowContent.current?.querySelector('h1');
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [panel, state.detail?.bundle.request.request_id]);
  const mock = repository.mode === 'mock';
  const startDemo = async (scenario: DemoScenario) => {
    if (await runDemo(scenario)) setPanel(null);
  };

  return <div className="guided-app">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="flow-header">
      <button className="brand off-chase-brand" aria-label="Off-Chase 메인으로" onClick={() => setPanel('home')}><img src="/off-chase.svg" alt="" /><span><strong>Off-Chase</strong><span className="brand-tagline">Verifiable Off-chain Decisions</span></span></button>
      <div className="flow-header-tools">{mock && <span className="mock-tag">MOCK DEMO</span>}<button className="text-button" aria-pressed={panel === 'file'} onClick={() => setPanel('file')}>증거 파일로 검증 <span aria-hidden="true">↗</span></button></div>
    </header>
    <main id="main-content" className={`flow-main ${panel === 'home' ? 'home-layout' : ''}`}>
      {panel && panel !== 'home' && <button className="flow-back text-button" onClick={() => setPanel(state.selectedId ? null : 'home')}>{state.selectedId ? '← 사건 흐름으로 돌아가기' : '← 서비스 소개로 돌아가기'}</button>}
      {panel === 'home' && <Home headingRef={panelHeading} onStart={() => { setCaseFilter('ALL'); setPanel('cases'); }} />}
      <div ref={flowContent} hidden={panel !== null}>
        <div className="flow-context"><span><span className="eyebrow">DECISION WALKTHROUGH</span><span className="context-case mono">{state.selectedId ?? '사건을 준비하고 있습니다'}</span></span><button className="text-button" onClick={() => setPanel('cases')}>다른 사건 선택 <span aria-hidden="true">↗</span></button></div>
        {state.listLoad === 'loading' && <div className="flow-placeholder" role="status">요청 목록을 준비하고 있습니다…</div>}
        {state.listError && <div className="error-message" role="alert">{state.listError}<button onClick={() => void refreshList()}>다시 시도</button></div>}
        {state.selectedId && state.load === 'loading' && <div className="flow-placeholder" role="status">요청과 적용 정책을 불러오는 중…</div>}
        {state.error && <div className="error-message" role="alert">{state.error}<button onClick={retryDetail}>다시 시도</button></div>}
        {!state.selectedId && state.listLoad === 'ready' && <section className="flow-placeholder"><h1>살펴볼 요청을 선택해 주세요.</h1><p>결제 판단과 증거를 한 단계씩 확인할 수 있습니다.</p><button className="primary-button" onClick={() => setPanel('cases')}>요청 선택하기 →</button></section>}
        {state.detail && <GuidedCase key={state.selectedId} detail={state.detail} mock={mock} onVerify={verifyCase} onDownload={() => void download()} downloading={state.downloadBusy} onDemo={() => setPanel('demo')} />}
      </div>
      {panel === 'cases' && <section className="flow-picker" aria-label="요청 선택">
        <div className="flow-intro"><span className="eyebrow">CHOOSE A REQUEST</span><h1 ref={panelHeading} tabIndex={-1}>어떤 요청을 살펴볼까요?</h1><p>아래 목록에서 직접 선택해 주세요. 요청 확인부터 단계별로 안내합니다.</p></div>
        {state.listLoad === 'loading' && <p role="status" className="flow-placeholder">요청 목록을 불러오는 중…</p>}
        <CaseList cases={state.cases} selectedId={state.selectedId} filter={caseFilter} onFilter={setCaseFilter} onSelect={id => { dispatch({ type: 'select', id }); setPanel(null); }} />
        {state.listLoad === 'ready' && state.cases.length === 0 && <button className="primary-button" disabled={!!state.demo} onClick={() => void startDemo('normal')}>데모 요청 만들기 →</button>}
        {state.listError && <div className="error-message" role="alert">{state.listError}<button onClick={() => void refreshList()}>다시 시도</button></div>}
      </section>}
      {panel === 'file' && <section className="flow-file" id="verifier" aria-labelledby="file-heading">
        <div className="flow-intro"><span className="eyebrow">VERIFY YOUR EVIDENCE</span><h1 ref={panelHeading} tabIndex={-1} id="file-heading">증거 파일을 확인하세요.</h1><p>확보한 Evidence Bundle로 판단의 근거를 다시 확인합니다.</p></div>
        <div className="flow-card upload-card"><span className="upload-symbol" aria-hidden="true">↑</span><h2>Evidence Bundle 업로드</h2><p>판단 검증용 JSON 파일을 선택해 주세요.</p>
          <label className="upload-label">{state.file ? '다른 파일 선택' : '파일 선택'}<input aria-label="Upload Evidence" type="file" accept=".json,application/json" onChange={event => selectFile(event.target.files?.[0] ?? null)} /></label>
          {state.file && <p className="file-name">선택한 파일: {state.file.name}</p>}<span className="small-note">JSON · 최대 2MB</span>
        </div>
        <div className="flow-actions"><p>파일을 선택한 뒤 검증을 진행하세요.</p><button className="primary-button" disabled={!state.file || state.fileBusy} onClick={() => void verifyFile()}>{state.fileBusy ? '증거 확인 중…' : '파일 검증하기 →'}</button></div>
        {state.fileError && <p className="error-message" role="alert">{state.fileError}</p>}{state.result && <VerificationResult result={state.result} />}
      </section>}
      {panel === 'demo' && <section className="flow-demo" aria-label="시나리오 비교"><div className="flow-intro"><span className="eyebrow">EXPLORE ANOTHER OUTCOME</span><h1 ref={panelHeading} tabIndex={-1}>기록이 달라지면, 결과는 어떨까요?</h1><p>하나의 상황을 선택하고, 같은 순서로 판단의 근거를 따라가 보세요.</p></div><DemoControls busy={state.demo} onRun={scenario => void startDemo(scenario)} /></section>}
      {state.notice && <p className="context-note" role="status">{state.notice}</p>}
      <footer className="flow-footer"><span>Off-Chase <span aria-hidden="true">/</span> Evidence, not assumptions.</span>{mock ? <span>모의 데이터 · 실제 서명·온체인 검증이 아닙니다.</span> : <span>Verifiable Off-chain Decisions</span>}</footer>
    </main>
  </div>;
}
