import { ref } from 'vue';

export function createLazyTabState(initialTab = 'info') {
  const activeTab = ref(initialTab);
  const activatedTabs = ref(new Set([initialTab]));

  function activateTab(name) {
    activeTab.value = name;
    activatedTabs.value = new Set([...activatedTabs.value, name]);
  }

  function isTabActivated(name) {
    return activatedTabs.value.has(name);
  }

  function reset(nextInitialTab = initialTab) {
    activeTab.value = nextInitialTab;
    activatedTabs.value = new Set([nextInitialTab]);
  }

  return {
    activeTab,
    activatedTabs,
    activateTab,
    isTabActivated,
    reset,
  };
}
