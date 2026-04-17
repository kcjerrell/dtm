import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { useCallback, useMemo } from "react"
import { DtpService } from "@/commands"
import {
    FaMagnifyingGlass,
    FiEye,
    FiEyeOff,
    FiFolder,
    FiRefreshCw,
    MdBlock,
} from "@/components/icons/icons"
import { getSpacer, type ICommand } from "@/types"
import { plural } from "@/utils/helpers"
import { showMenu } from "@/utils/menu"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"

export function useProjectsCommands(): [
    (selected: ProjectState[]) => Promise<(() => void | Promise<void>) | null>,
    ICommand<ProjectState>[],
] {
    const { projects, uiState } = useDTP()
    const snap = projects.useSnap()

    const commands: ICommand<ProjectState>[] = useMemo(
        () => [
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
            getSpacer<ProjectState, undefined>("toolbar"),
            {
                id: "scan",
                getLabel: (selected) => `Rescan project${plural(selected.length)}`,
                tipText: "Rescan project for changes",
                icon: FiRefreshCw,
                onClick: async (selected) => {
                    DtpService.syncProjects(selected.map((f) => f.id))
                },
                requiresSelection: true,
                toolbarEnableMode: "hide",
                getEnabled(selected) {
                    return (
                        !!selected && selected.length > 0 && selected.every((p) => p && !p.excluded)
                    )
                },
            },
            {
                id: "explore",
                label: "Explore project",
                tipText: "Browse project tables and data",
                icon: FaMagnifyingGlass,
                requiresSingleSelection: true,
                onClick: (selected) => {
                    uiState.showDialog({
                        dialogType: "explorer",
                        props: { projectId: selected[0].id },
                    })
                },
            },
            {
                id: "exclude",
                getLabel: (selected) => {
                    const verb = selected[0]?.excluded ? "Show" : "Hide"
                    const noun = plural(selected.length, "project", "projects")
                    return `${verb} ${noun}`
                },
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
        ],
        [projects, snap.showEmptyProjects, uiState.showDialog],
    )

    const selectMenuCommand = useCallback(
        async (selected: ProjectState[]) => {
            const command = await showMenu(commands, selected)
            if (!command) return null
            return () => command.onClick?.(selected)
        },
        [commands],
    )

    return [selectMenuCommand, commands] as const
}
