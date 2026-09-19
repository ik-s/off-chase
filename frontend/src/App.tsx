import { useEffect, useRef, useState } from 'react';
import type { DemoScenario, EvidenceRepository } from './data/types.ts';
import { CaseList, DemoControls, VerificationResult } from './components.tsx';
import { GuidedCase } from './GuidedCase.tsx';
import { Home } from './Home.tsx';
import { useWorkspace } from './useWorkspace.ts';
import './flow.css';
import './branding.css';
import './workbench.css';

export default function App({ repository }: { repository: EvidenceRepository }) {
  const { state, dispatch, refreshList, retryDetail, runDemo, selectFile, verifyFile, download, verifyCase } = useWorkspace(repository);
  const [panel, setPanel] = useState<'home' | 'cases' | 'file' | 'demo'>('home');
  const content = useRef<HTMLDivElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    Array.from(content.current?.querySelectorAll('h1') ?? []).find(heading => !heading.closest('[hidden]'))?.focus();
  }, [panel, state.detail?.bundle.request.request_id]);
  const mock = repository.mode === 'mock';
  const startDemo = async (scenario: DemoScenario) => {
    if (await runDemo(scenario)) setPanel('cases');
  };
  const openCases = () => {
    setPanel('cases');
    sidebar.current?.querySelector<HTMLButtonElement>('.case-item')?.focus();
  };

  return <div className="guided-app audit-app">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="flow-header">
      <button className="brand off-chase-brand" aria-label="Off-Chase 메인으로" onClick={() => setPanel('home')}><img src="/off-chase.svg" alt="" /><span><strong>Off-Chase</strong><span className="brand-tagline">Decision Evidence</span></span></button>
      <nav aria-label="Workspace" className="audit-nav"><button aria-pressed={panel === 'cases'} onClick={openCases}>Cases</button><button aria-pressed={panel === 'file'} onClick={() => setPanel('file')}>File Verifier</button></nav>
      <div className="flow-header-tools">{mock && <span className="mock-tag">MOCK DEMO</span>}<span className="audit-meta">Sepolia</span></div>
    </header>
    <div className="audit-shell">
      <aside className="audit-sidebar" ref={sidebar} aria-label="Case List">
        {state.listLoad === 'loading' && <p role="status">목록을 불러오는 중…</p>}
        <CaseList cases={state.cases} selectedId={state.selectedId} filter={state.filter} onFilter={filter => dispatch({ type: 'filter', filter })} onSelect={id => { dispatch({ type: 'select', id }); setPanel('cases'); }} />
        {state.listError && <div className="error-message" role="alert">{state.listError}<button onClick={() => void refreshList()}>다시 시도</button></div>}
        <button className="text-button sidebar-demo" aria-pressed={panel === 'demo'} onClick={() => setPanel('demo')}>Demo Controls</button>
      </aside>
      <main id="main-content" className="audit-main" ref={content}>
        {panel === 'home' && <Home headingRef={panelHeading} onStart={openCases} />}
        <div hidden={panel !== 'cases'}>
          {state.selectedId && state.load === 'loading' && <p className="empty-state" role="status">사건을 불러오는 중…</p>}
          {state.error && <div className="error-message" role="alert">{state.error}<button onClick={retryDetail}>다시 시도</button></div>}
          {!state.selectedId && <section className="empty-state"><h1 tabIndex={-1}>Cases</h1><p>Case List에서 조사할 요청을 선택하세요.</p></section>}
          {state.detail && <GuidedCase key={state.selectedId} detail={state.detail} mock={mock} onVerify={verifyCase} onDownload={() => void download()} downloading={state.downloadBusy} onDemo={() => setPanel('demo')} />}
        </div>
        {panel === 'file' && <section className="audit-utility" id="verifier" aria-labelledby="file-heading">
          <h1 tabIndex={-1} id="file-heading">File Verifier</h1>
          <div className="upload-card"><h2>Evidence Bundle</h2><p className="audit-meta">JSON · 최대 2MB</p>
            <label className="upload-label">파일 선택<input aria-label="Upload Evidence" type="file" accept=".json,application/json" onChange={event => selectFile(event.target.files?.[0] ?? null)} /></label>
            {state.file && <p className="file-name">{state.file.name}</p>}
          </div>
          <button className="primary-button" disabled={!state.file || state.fileBusy} onClick={() => void verifyFile()}>{state.fileBusy ? '검증 중…' : '파일 검증'}</button>
          {state.fileError && <p className="error-message" role="alert">{state.fileError}</p>}{state.result && <VerificationResult result={state.result} />}
        </section>}
        {panel === 'demo' && <section className="audit-utility" aria-label="시나리오 비교"><h1 tabIndex={-1}>Demo Scenarios</h1><DemoControls busy={state.demo} onRun={scenario => void startDemo(scenario)} /></section>}
        {state.notice && <p className="context-note" role="status">{state.notice}</p>}
        <footer className="audit-footer">{mock ? 'Mock Data · 실제 서명 및 온체인 검증 아님 · 시각 UTC' : 'Off-Chase · 시각 UTC'}</footer>
      </main>
    </div>
  </div>;
}
