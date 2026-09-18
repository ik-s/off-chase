import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DemoScenario, EvidenceRepository } from './data/types.ts';
import { initialState, workspaceReducer } from './state.ts';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '일시적인 오류입니다. 다시 시도해 주세요.';

export function useWorkspace(repository: EvidenceRepository) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const [retry, retryDetail] = useReducer((value: number) => value + 1, 0);
  const listGeneration = useRef(0);
  const fileGeneration = useRef(0);
  const demoLock = useRef(false);
  const refreshList = useCallback(async (preferredId?: string) => {
    const generation = ++listGeneration.current;
    try {
      const cases = await repository.listCases();
      if (generation === listGeneration.current) dispatch({ type: 'list', cases, preferredId });
    } catch (error) {
      if (generation === listGeneration.current) dispatch({ type: 'patch', patch: { listLoad: 'error', listError: errorMessage(error) } });
    }
  }, [repository]);

  useEffect(() => { void refreshList(); return () => { listGeneration.current++; }; }, [refreshList]);
  const hasProcessing = state.cases.some(c => c.status === 'PROCESSING');
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(() => { if (!demoLock.current) void refreshList(); }, 1000);
    return () => clearInterval(timer);
  }, [hasProcessing, refreshList]);

  useEffect(() => {
    const id = state.selectedId;
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const detail = await repository.getCase(id);
        if (active) {
          dispatch({ type: 'detail', id, detail });
          if (detail.report.status === 'PROCESSING') timer = setTimeout(() => void load(), 1000);
        }
      } catch (error) {
        if (active) dispatch({ type: 'detail-error', id, error: errorMessage(error) });
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [repository, state.selectedId, retry]);

  const runDemo = async (scenario: DemoScenario) => {
    if (demoLock.current) return;
    demoLock.current = true;
    dispatch({ type: 'patch', patch: { demo: scenario, notice: null } });
    try {
      const id = await repository.runDemo(scenario);
      await refreshList(id);
      return id;
    }
    catch (error) { dispatch({ type: 'patch', patch: { notice: errorMessage(error) } }); }
    finally { demoLock.current = false; dispatch({ type: 'patch', patch: { demo: null } }); }
  };
  const selectFile = (file: File | null) => {
    fileGeneration.current++;
    dispatch({ type: 'patch', patch: { file, result: null, fileError: null, fileBusy: false } });
  };
  const verifyFile = async () => {
    if (!state.file) return;
    const generation = ++fileGeneration.current;
    dispatch({ type: 'patch', patch: { fileBusy: true, fileError: null, result: null } });
    try {
      // Bound local file reads; ordinary evidence bundles are only a few KB.
      if (state.file.size > 2 * 1024 * 1024) throw new Error('2MB 이하의 Evidence JSON 파일을 선택해 주세요.');
      if (!state.file.name.toLowerCase().endsWith('.json')) throw new Error('JSON 파일을 선택해 주세요.');
      let input: unknown;
      try { input = JSON.parse(await state.file.text()); }
      catch { throw new Error('JSON을 읽을 수 없습니다. 파일 형식을 확인해 주세요.'); }
      const result = await repository.verifyEvidence(input);
      if (generation === fileGeneration.current) dispatch({ type: 'patch', patch: { result } });
    } catch (error) {
      if (generation === fileGeneration.current) dispatch({ type: 'patch', patch: { fileError: errorMessage(error) } });
    } finally {
      if (generation === fileGeneration.current) dispatch({ type: 'patch', patch: { fileBusy: false } });
    }
  };
  const download = async () => {
    if (!state.selectedId || state.downloadBusy) return;
    dispatch({ type: 'patch', patch: { downloadBusy: true, notice: null } });
    try {
      const file = await repository.downloadEvidence(state.selectedId);
      const url = URL.createObjectURL(new Blob([file.content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = file.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      dispatch({ type: 'patch', patch: { notice: `${file.filename} 다운로드를 시작했습니다.` } });
    } catch (error) { dispatch({ type: 'patch', patch: { notice: errorMessage(error) } }); }
    finally { dispatch({ type: 'patch', patch: { downloadBusy: false } }); }
  };
  const verifyCase = async () => {
    if (!state.detail) throw new Error('먼저 사건을 선택해 주세요.');
    return repository.verifyEvidence(state.detail.bundle);
  };
  return { state, dispatch, refreshList, retryDetail, runDemo, selectFile, verifyFile, download, verifyCase };
}
