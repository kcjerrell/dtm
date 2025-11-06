import { proxy } from 'valtio'
import type { DTImage, DTProject, TensorHistoryExtra } from '../types'

const state = proxy({
  projects: [] as DTProject[],
  items: [] as DTImage[],
  itemDetails: {} as Record<number, TensorHistoryExtra>,
  scanProgress: -1,
  scanningProject: "",
  totalThisRun: 0,
  selectedProject: null as DTProject | null,
  expandedItems: {} as Record<number, boolean>,
  searchInput: "",
})

async function loadProjects() {

}

const DTProjects = {
  state
}

export default DTProjects