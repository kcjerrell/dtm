import { Menu, MenuItem, type MenuOptions, PredefinedMenuItem } from "@tauri-apps/api/menu"
import type { ICommand, ICommandItem } from "@/types"

export async function showMenu<T, C = undefined>(
    commands: ICommandItem<T, C>[],
    selected: T[],
    context?: C,
): Promise<ICommand<T, C> | null> {
    let selectedItem: ICommandItem<T, C> | null = null

    const items: MenuOptions["items"] = []
    for (const command of commands) {
        if (command.toolbarOnly) continue

        if (command.separator || command.spacer) {
            items.push(
                await PredefinedMenuItem.new({
                    text: "separator-text",
                    item: "Separator",
                }),
            )
            continue
        }

        const isEnabled = !command.spacer ? (command.getEnabled?.(selected, context) ?? true) : true
        if (!isEnabled && !command.spacer && command.menuEnableMode === "hide") continue

        let label = command.getLabel?.(selected, context) ?? command.label ?? ""
        if (command.ellipses) label += "..."

        items.push(
            await MenuItem.new({
                id: command.id,
                text: label,
                enabled: isEnabled,
                action: () => {
                    selectedItem = command
                },
                accelerator: command.accelerator,
            }),
        )
    }

    const menu = await Menu.new({ items })
    await menu.popup()

    return selectedItem
}
