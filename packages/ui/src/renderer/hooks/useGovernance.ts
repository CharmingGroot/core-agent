import { useState, useEffect, useCallback } from 'react';
import type { GovernanceState, PolicyMode, DomainEntry } from '../types.js';
import type { ElectronApi, GovernanceStatePayload } from '../electron-api.js';

declare global {
  interface Window {
    electronApi: ElectronApi;
  }
}

const EMPTY_STATE: GovernanceState = {
  policyMode: 'standalone',
  domains: [],
  skills: [],
  rules: [],
  auditLog: [],
};

function mapPayloadToState(payload: GovernanceStatePayload): GovernanceState {
  return {
    policyMode: payload.policyMode,
    domains: payload.domains.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      skills: d.skills,
      agents: d.agents,
    })),
    skills: payload.skills.map((s) => ({
      name: s.name,
      description: s.description,
      tools: s.tools,
    })),
    rules: payload.rules.map((r) => ({
      name: r.name,
      phase: r.phase,
      severity: r.severity,
      enabled: r.enabled,
    })),
    auditLog: payload.auditLog.map((a) => ({
      timestamp: a.timestamp,
      userId: a.userId,
      action: a.action,
      decision: a.decision,
      toolName: a.toolName,
      details: a.details,
    })),
  };
}

export interface UseGovernanceReturn {
  state: GovernanceState;
  setMode: (mode: PolicyMode) => void;
  addDomain: (domain: Omit<DomainEntry, 'id'>) => void;
  removeDomain: (id: string) => void;
  toggleRule: (ruleName: string) => void;
  clearAudit: () => void;
}

/**
 * useGovernance — connects governance UI to the main process via IPC.
 *
 * Falls back to local state when electronApi is not available (SSR/test).
 */
export function useGovernance(): UseGovernanceReturn {
  const [state, setState] = useState<GovernanceState>(EMPTY_STATE);
  const hasApi = typeof window !== 'undefined' && window.electronApi?.govGetState;

  useEffect(() => {
    if (!hasApi) return;

    const unsub = window.electronApi.onGovState((payload) => {
      setState(mapPayloadToState(payload));
    });

    // Request initial state
    window.electronApi.govGetState();

    return unsub;
  }, [hasApi]);

  const setMode = useCallback((mode: PolicyMode) => {
    if (hasApi) {
      window.electronApi.govSetMode(mode);
    } else {
      setState((prev) => ({ ...prev, policyMode: mode }));
    }
  }, [hasApi]);

  const addDomain = useCallback((domain: Omit<DomainEntry, 'id'>) => {
    if (hasApi) {
      window.electronApi.govAddDomain(domain);
    }
  }, [hasApi]);

  const removeDomain = useCallback((id: string) => {
    if (hasApi) {
      window.electronApi.govRemoveDomain(id);
    }
  }, [hasApi]);

  const toggleRule = useCallback((ruleName: string) => {
    if (hasApi) {
      window.electronApi.govToggleRule(ruleName);
    }
  }, [hasApi]);

  const clearAudit = useCallback(() => {
    if (hasApi) {
      window.electronApi.govClearAudit();
    } else {
      setState((prev) => ({ ...prev, auditLog: [] }));
    }
  }, [hasApi]);

  return { state, setMode, addDomain, removeDomain, toggleRule, clearAudit };
}
