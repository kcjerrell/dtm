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

        const isEnabled = !command.spacer ? (command.getEnabled?.(selected, context) ?? true) : true
        if (!isEnabled && !command.spacer && command.menuEnableMode === "hide") continue

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
