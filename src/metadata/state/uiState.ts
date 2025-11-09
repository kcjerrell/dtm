import { proxy, useSnapshot } from 'valtio';

export type UIStateType = {
  selectedTab: "projects" | "search" | "settings"
  searchInput: string
}

const uiState = proxy({
  selectedTab: "projects",
  searchInput: "",
})

export function useUiState() {
  const uiSnap = useSnapshot(uiState)
  return { 
    uiSnap,
    uiState
  }
}