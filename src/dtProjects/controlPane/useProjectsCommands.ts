import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { DtpService } from "@/commands"
import { FiEye, FiEyeOff, FiFolder, FiRefreshCw, MdBlock } from "@/components/icons/icons"
import { getSpacer, type ICommandItem } from "@/types"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"

export function useProjectsCommands(): ICommandItem<ProjectState>[] {
    const { projects } = useDTP()
    const snap = projects.useSnap()

    return [
        {
            id: "hideEmpty",
            toolbarOnly: true,
            label: "Hide empty projects",
            tipText: "Hide projects with no matches when searching",
            icon: snap.showEmptyProjects ? FiEyeOff : FiEye,
            onClick: async () => {
                projects?.toggleShowEmptyProjects()
            },
            requiresSelection: false,
        },
        getSpacer("toolbar"),
        {
            id: "scan",
            label: "Scan project",
            tipText: "Scan project for new images",
            icon: FiRefreshCw,
            onClick: async (selected) => {
                DtpService.syncProjects(selected.map((f) => f.id))
            },
            requiresSelection: true,
        },
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
            getLabel: (selected) => (selected[0]?.excluded ? "Show project" : "Hide project"),
            tipText: "Hidden projects will not be scanned and their images won't be listed.",
            getIcon: (selected) => (selected[0]?.excluded ? FiRefreshCw : MdBlock),
            onClick: (selected) => {
                projects?.setExclude(selected, !selected[0]?.excluded)
            },
            requiresSelection: true,
        },
        {
            id: "openFolder",
            label: "Open folder",
            tipText: "Open project folder in file manager.",
            icon: FiFolder,
            onClick: async (selected) => {
                await revealItemInDir(selected.map((f) => f.full_path))
            },
            requiresSelection: true,
        },
    ]
}
