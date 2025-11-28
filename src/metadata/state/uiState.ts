import { proxy, useSnapshot } from 'valtio';
import type { Model } from '@/commands';

export type UIStateType = {
  selectedTab: "projects" | "search" | "settings"
  searchInput: string,
  selectedModels: Model[]
}

const uiState = proxy({
  selectedTab: "projects",
  searchInput: "",
  selectedModels: [] as Model[],
})

export function useUiState() {
  const uiSnap = useSnapshot(uiState)
  return { 
    uiSnap,
    uiState
  }
}