import { useCallback, useEffect, useState } from 'react';
import type { NavTab } from '../../types/fitness';

const VALID_NAV_TABS: readonly NavTab[] = [
  'inicio',
  'painel',
  'treinar',
  'arsenal',
  'progresso',
  'coach',
  'api',
  'perfil',
];

function getInitialTabFromUrl(): NavTab {
  if (typeof window === 'undefined') return 'inicio';
  try {
    const param = new URLSearchParams(window.location.search).get('tab');
    if (param && (VALID_NAV_TABS as readonly string[]).includes(param)) {
      return param as NavTab;
    }
  } catch {
    // ignora erro de leitura de URL
  }
  return 'inicio';
}

export function useNavigation() {
  const [activeTab, setActiveTabState] = useState<NavTab>(() => getInitialTabFromUrl());

  const setActiveTab = useCallback((nextTab: NavTab): void => {
    if (nextTab === activeTab) return;
    setActiveTabState(nextTab);
    try {
      const url = new URL(window.location.href);
      if (nextTab === 'inicio') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', nextTab);
      }
      if (url.toString() !== window.location.href) {
        window.history.pushState({ tab: nextTab }, '', url.toString());
      }
    } catch {
      // ignora em contextos restritos
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  useEffect(() => {
    const onPopState = (): void => {
      setActiveTabState(getInitialTabFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return { activeTab, setActiveTab };
}
