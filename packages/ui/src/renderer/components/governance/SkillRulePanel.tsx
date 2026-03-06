import React from 'react';
import type { SkillEntry, RuleEntry } from '../../types.js';

interface SkillRulePanelProps {
  skills: readonly SkillEntry[];
  rules: readonly RuleEntry[];
  onToggleRule: (ruleName: string) => void;
}

export function SkillRulePanel({ skills, rules, onToggleRule }: SkillRulePanelProps): React.ReactElement {
  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Loaded Skills</h3>
        {skills.length === 0 ? (
          <div style={styles.empty}>No skills loaded. Place .skill.md files in your skills directory.</div>
        ) : (
          <div style={styles.grid}>
            {skills.map((skill) => (
              <div key={skill.name} style={styles.skillCard}>
                <div style={styles.skillName}>{skill.name}</div>
                <div style={styles.skillDesc}>{skill.description}</div>
                <div style={styles.toolRow}>
                  {skill.tools.map((t) => (
                    <span key={t} style={styles.toolBadge}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Rule Engine</h3>
        {rules.length === 0 ? (
          <div style={styles.empty}>No rules configured.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Rule</th>
                <th style={styles.th}>Phase</th>
                <th style={styles.th}>Severity</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.name} style={styles.tr}>
                  <td style={styles.td}>
                    <span style={styles.ruleName}>{rule.name}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.phaseBadge}>{rule.phase}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={severityStyle(rule.severity)}>{rule.severity}</span>
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => onToggleRule(rule.name)}
                      style={{
                        ...styles.toggleButton,
                        backgroundColor: rule.enabled ? '#166534' : '#1e293b',
                        color: rule.enabled ? '#4ade80' : '#64748b',
                      }}
                    >
                      {rule.enabled ? 'ON' : 'OFF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function severityStyle(severity: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    block: { bg: '#7f1d1d', fg: '#fca5a5' },
    warn: { bg: '#78350f', fg: '#fcd34d' },
    log: { bg: '#1e3a5f', fg: '#93c5fd' },
  };
  const c = colors[severity] ?? colors['log'];
  return {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: c.bg,
    color: c.fg,
    fontWeight: 600,
    textTransform: 'uppercase',
  };
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  divider: {
    height: '1px',
    backgroundColor: '#1e293b',
  },
  empty: {
    color: '#64748b',
    fontSize: '14px',
    padding: '16px',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '8px',
  },
  skillCard: {
    padding: '12px',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  skillName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  skillDesc: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  toolRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  toolBadge: {
    fontSize: '10px',
    color: '#a5b4fc',
    backgroundColor: '#1e1b4b',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    borderBottom: '1px solid #1e293b',
  },
  tr: {
    borderBottom: '1px solid #0f172a',
  },
  td: {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e2e8f0',
  },
  ruleName: {
    fontFamily: 'monospace',
    fontSize: '13px',
  },
  phaseBadge: {
    fontSize: '11px',
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  toggleButton: {
    border: '1px solid #334155',
    borderRadius: '4px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
};
