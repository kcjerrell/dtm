import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { FiEye, FiEyeOff, FiFolder, FiRefreshCw } from "react-icons/fi"
import { MdBlock } from "react-icons/md"
import type { PanelListCommandItem } from "@/components/PanelList"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"

export function useProjectsCommands(): PanelListCommandItem<ProjectState>[] {
	const { projects } = useDTP()
	const snap = projects.useSnap()

	return [
		{
			id: "hideEmpty",
			tipTitle: "Hide empty projects",
			tipText: "Hide projects with no matches when searching",
			icon: snap.showEmptyProjects ? FiEyeOff : FiEye,
			onClick: async () => {
				projects?.toggleShowEmptyProjects()
			},
			requiresSelection: false,
		},
		"spacer",
		{
			id: "exclude",
			getTipTitle: (selected) => (selected[0]?.excluded ? "Include project" : "Exclude project"),
			tipText: "Excluded projects will not be scanned and their images won't be listed.",
			getIcon: (selected) => (selected[0]?.excluded ? FiRefreshCw : MdBlock),
			onClick: (selected) => {
				projects?.setExclude(selected, !selected[0]?.excluded)
			},
			requiresSelection: true,
		},
		{
			id: "openFolder",
			tipTitle: "Open folder",
			tipText: "Open project folder in file manager.",
			icon: FiFolder,
			onClick: async (selected) => {
				await revealItemInDir(selected.map((f) => f.path))
			},
			requiresSelection: true,
		},
	]
}
