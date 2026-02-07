import { revealItemInDir } from "@tauri-apps/plugin-opener"
import {
    FiEye,
    FiEyeOff,
    FiFolder,
    FiRefreshCw,
    MdBlock
} from "@/components/icons/icons"
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
        // {
        //     id: "fullScan",
        //     tipTitle: "Full scan",
        //     tipText: "Include ALL items in project",
        //     icon: GiNeedleDrill,
        //     onClick: async (selected) => {
        //         pdb.scanProject(selected[0].path, true)
        //     },
        //     requiresSelection: true,
        //     requiresSingleSelection: true,
        // },
        {
            id: "exclude",
            getTipTitle: (selected) =>
                selected[0]?.excluded ? "Include project" : "Exclude project",
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
