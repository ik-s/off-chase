import type { CaseDetail, CaseFilter, CaseSummaryViewModel, DemoScenario, EvidenceSelection, LoadState, VerificationOutcome } from './data/types.ts';

export interface WorkspaceState {
  cases: CaseSummaryViewModel[];
  filter: CaseFilter;
  selectedId: string | null;
  evidence: EvidenceSelection;
  detail: CaseDetail | null;
  load: LoadState;
  listLoad: LoadState;
  error: string | null;
  listError: string | null;
  demo: DemoScenario | null;
  file: File | null;
  result: VerificationOutcome | null;
  fileError: string | null;
  fileBusy: boolean;
  downloadBusy: boolean;
  notice: string | null;
}
export const initialState: WorkspaceState = {
  cases: [], filter: 'ALL', selectedId: null, evidence: 'decision', detail: null,
  load: 'ready', listLoad: 'loading', error: null, listError: null, demo: null,
  file: null, result: null, fileError: null, fileBusy: false, downloadBusy: false, notice: null,
};
export const visibleCases = (cases: CaseSummaryViewModel[], filter: CaseFilter) => cases.filter(item => filter === 'ALL' || item.status === filter);
function select(state: WorkspaceState, id: string | null): WorkspaceState {
  if (id === state.selectedId) return state;
  return { ...state, selectedId: id, detail: null, evidence: 'decision', load: id ? 'loading' : 'ready', error: null, notice: null };
}
export type Action =
  | { type: 'list'; cases: CaseSummaryViewModel[]; preferredId?: string }
  | { type: 'filter'; filter: CaseFilter }
  | { type: 'select'; id: string }
  | { type: 'detail'; id: string; detail: CaseDetail }
  | { type: 'detail-error'; id: string; error: string }
  | { type: 'evidence'; evidence: EvidenceSelection }
  | { type: 'patch'; patch: Partial<WorkspaceState> };
export function workspaceReducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'list': {
      const filter = action.preferredId ? 'ALL' : state.filter;
      const visible = visibleCases(action.cases, filter);
      const id = action.preferredId ?? (visible.some(c => c.id === state.selectedId) ? state.selectedId : null);
      return select({ ...state, cases: action.cases, filter, listLoad: 'ready', listError: null }, id);
    }
    case 'filter': {
      const visible = visibleCases(state.cases, action.filter);
      const id = visible.some(c => c.id === state.selectedId) ? state.selectedId : null;
      return select({ ...state, filter: action.filter }, id);
    }
    case 'select': return select(state, action.id);
    case 'detail': return action.id !== state.selectedId ? state : {
      ...state, detail: action.detail, load: 'ready', error: null,
      evidence: state.detail ? state.evidence : action.detail.bundle.decision ? 'decision' : 'verification_receipt',
    };
    case 'detail-error': return action.id !== state.selectedId ? state : { ...state, error: action.error, load: 'error' };
    case 'evidence': return { ...state, evidence: action.evidence };
    case 'patch': return { ...state, ...action.patch };
  }
}
