import React, { useState } from 'react';
import type { GovernanceTab } from '../../types.js';
import { GovernanceNav } from './GovernanceNav.js';
import { DomainPanel } from './DomainPanel.js';
import { SkillRulePanel } from './SkillRulePanel.js';
import { AuditLogPanel } from './AuditLogPanel.js';
import { useGovernance } from '../../hooks/useGovernance.js';

interface GovernancePanelProps {
  onBack: () => void;
}

export function GovernancePanel({ onBack }: GovernancePanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<GovernanceTab>('domains');
  const { state, setMode, addDomain, removeDomain, toggleRule, clearAudit } = useGovernance();

  return (
    <div style={styles.container}>
      <GovernanceNav
        activeTab={activeTab}
        policyMode={state.policyMode}
        onTabChange={setActiveTab}
        onModeChange={setMode}
        onBack={onBack}
      />
      <div style={styles.content}>
        {activeTab === 'domains' && (
          <DomainPanel
            domains={state.domains}
            onAdd={addDomain}
            onRemove={removeDomain}
          />
        )}
        {activeTab === 'skills' && (
          <SkillRulePanel
            skills={state.skills}
            rules={state.rules}
            onToggleRule={toggleRule}
          />
        )}
        {activeTab === 'audit' && (
          <AuditLogPanel
            entries={state.auditLog}
            onClear={clearAudit}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
  },
};
