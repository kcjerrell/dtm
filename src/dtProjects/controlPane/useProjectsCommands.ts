import { Menu, MenuItem, type MenuOptions, PredefinedMenuItem } from "@tauri-apps/api/menu"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { useCallback, useMemo } from "react"
import type { Snapshot } from "valtio"
import { DtpService } from "@/commands"
import { FiEye, FiEyeOff, FiFolder, FiRefreshCw, MdBlock } from "@/components/icons/icons"
import { getSpacer, type ICommandItem } from "@/types"
import { plural } from "@/utils/helpers"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"

export function useProjectsCommands(): [
    (selected: Snapshot<ProjectState[]>) => Promise<void>,
    ICommandItem<ProjectState>[],
] {
    const { projects } = useDTP()
    const snap = projects.useSnap()

    const commands: ICommandItem<ProjectState>[] = useMemo(
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
            getSpacer("toolbar"),
            {
                id: "scan",
                getLabel: (selected) => `Scan project${plural(selected.length)}`,
                tipText: "Scan project for new images",
                icon: FiRefreshCw,
                onClick: async (selected) => {
                    DtpService.syncProjects(selected.map((f) => f.id))
                },
                requiresSelection: true,
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
        [projects, snap.showEmptyProjects],
    )

    const onContextMenu = useCallback(
        async (selected: Snapshot<ProjectState[]>) => {
            const menu = await createMenu(commands, selected)
            await menu.popup()
        },
        [commands],
    )

    return [onContextMenu, commands] as const
}

async function createMenu<T, C = undefined>(
    commands: ICommandItem<T, C>[],
    selected: Snapshot<T[]>,
    context?: C,
) {
    const items: MenuOptions["items"] = []
    for (const command of commands) {
        if (command.toolbarOnly) continue
        if (command.spacer) {
            items.push(
                await PredefinedMenuItem.new({
                    text: "separator-text",
                    item: "Separator",
                }),
            )
            continue
        }
        items.push(
            await MenuItem.new({
                id: command.id,
                text: command.getLabel?.(selected, context) ?? command.label ?? "",
                enabled: command.getEnabled?.(selected, context) ?? true,
                action: () => command.onClick(selected, context),
            }),
        )
    }
    return Menu.new({ items })
}
