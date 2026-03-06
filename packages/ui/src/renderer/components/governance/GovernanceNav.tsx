import React from 'react';
import type { GovernanceTab, PolicyMode } from '../../types.js';

interface GovernanceNavProps {
  activeTab: GovernanceTab;
  policyMode: PolicyMode;
  onTabChange: (tab: GovernanceTab) => void;
  onModeChange: (mode: PolicyMode) => void;
  onBack: () => void;
}

const TABS: { id: GovernanceTab; label: string }[] = [
  { id: 'domains', label: 'Domains' },
  { id: 'skills', label: 'Skills & Rules' },
  { id: 'audit', label: 'Audit Log' },
];

export function GovernanceNav({
  activeTab,
  policyMode,
  onTabChange,
  onModeChange,
  onBack,
}: GovernanceNavProps): React.ReactElement {
  return (
    <div style={styles.nav}>
      <div style={styles.left}>
        <button onClick={onBack} style={styles.backButton}>
          {'<'} Back
        </button>
        <h2 style={styles.title}>Governance</h2>
        <div style={styles.modeSwitch}>
          <button
            onClick={() => onModeChange('standalone')}
            style={{
              ...styles.modeButton,
              ...(policyMode === 'standalone' ? styles.modeActive : {}),
            }}
          >
            Standalone
          </button>
          <button
            onClick={() => onModeChange('governed')}
            style={{
              ...styles.modeButton,
              ...(policyMode === 'governed' ? styles.modeActiveGoverned : {}),
            }}
          >
            Governed
          </button>
        </div>
      </div>
      <div style={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid #1e293b',
    backgroundColor: '#020617',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  backButton: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  modeSwitch: {
    display: 'flex',
    marginLeft: 'auto',
    border: '1px solid #334155',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  modeButton: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
  modeActive: {
    backgroundColor: '#1e40af',
    color: '#e2e8f0',
  },
  modeActiveGoverned: {
    backgroundColor: '#9333ea',
    color: '#e2e8f0',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
  },
  tab: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: '6px',
    color: '#64748b',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  tabActive: {
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    borderColor: '#334155',
  },
};
