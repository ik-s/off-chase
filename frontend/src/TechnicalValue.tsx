import { useState } from 'react';
import type { EvidenceBundle } from './data/records.ts';
import './technical-value.css';

export function TechnicalValue({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setStatus('copied'); }
    catch { setStatus('manual'); }
  };
  return <span className="technical-value">
    <code title={value}>{value.length > 32 ? `${value.slice(0, 14)}…${value.slice(-10)}` : value}</code>
    <button type="button" className="copy-value" aria-label={`${label} 복사`} onClick={() => void copy()}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg>
    </button>
    {status === 'copied' && <span className="copy-feedback" role="status">복사됨</span>}
    {status === 'manual' && <label className="manual-copy">선택 후 복사해 주세요<input aria-label={`${label} 원문`} readOnly value={value} onFocus={event => event.currentTarget.select()} /></label>}
  </span>;
}

export function ExplorerLinks({ anchors, mock }: { anchors: EvidenceBundle['anchors']; mock: boolean }) {
  if (mock || anchors.chain_id !== 11155111) return null;
  const links = [
    ['요청 거래', 'tx', anchors.request_tx],
    ['응답 거래', 'tx', anchors.decision_tx],
    ['컨트랙트', 'address', anchors.contract_address],
  ].filter(([, kind, value]) => typeof value === 'string' && new RegExp(`^0x[a-fA-F0-9]{${kind === 'tx' ? 64 : 40}}$`).test(value));
  return <nav className="explorer-links" aria-label="Sepolia 온체인 기록"><span>Sepolia Explorer</span>{links.map(([label, kind, value]) => <a key={label} href={`https://sepolia.etherscan.io/${kind}/${value}`} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</nav>;
}
