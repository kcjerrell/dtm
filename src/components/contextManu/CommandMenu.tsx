import { Box, Menu, Portal } from "@chakra-ui/react"
import { type RefObject, useEffect } from "react"
import type { Snapshot } from "valtio"
import { useRootElementRef } from "@/hooks/useRootElement"
import type { ICommand, ICommandItem } from "@/types"

interface CommandMenuProps<T, C = undefined> extends React.PropsWithChildren {
    commands: ICommandItem<T, C>[]
    selected: readonly Snapshot<T>[]
    context?: C
    onContextMenu?: (e: React.UIEvent) => void
    anchorRef?: RefObject<HTMLElement | null>
    offset?: { x: number; y: number }
    open: boolean
    setOpen: (value: boolean) => void
}

function CommandMenu<T, C = undefined>(props: CommandMenuProps<T, C>) {
    const { anchorRef, offset, commands, children, selected, context, open, setOpen } = props

    const appRoot = useRootElementRef("app")

    useEffect(() => {
        if (!open) return

        const pointerDownHandler = (e: PointerEvent) => {
            if ((e.target as HTMLElement).closest('[data-scope="menu"]')) return
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
        }
        const contextHandler = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('[data-scope="menu"]')) return

            setOpen(false)
        }

        addEventListener("pointerdown", pointerDownHandler, { once: true, capture: true })
        addEventListener("contextmenu", contextHandler, { once: true, capture: true })

        return () => {
            removeEventListener("pointerdown", pointerDownHandler, { capture: true })
            removeEventListener("contextmenu", contextHandler, { capture: true })
        }
    }, [open, setOpen])

    return (
        <Menu.Root
            positioning={{
                getAnchorElement: () => anchorRef?.current ?? null,
                offset: {
                    mainAxis: 0 - (offset?.y ?? 0),
                    crossAxis: offset?.x,
                },
                overlap: true,
                placement: "bottom-start",
            }}
            // lazyMount={true}
            // unmountOnExit={true}
            open={open}
            onOpenChange={(e) => {
                setOpen(e.open)
            }}
            variant={"solid"}
            onInteractOutside={(e) => e.stopPropagation()}
            onPointerDownOutside={(e) => e.stopPropagation()}
        >
            {/* <Menu.ContextTrigger  as={"div"}>{children}</Menu.ContextTrigger> */}
            <Portal container={appRoot}>
                <Box
                    zIndex={5}
                    display={open ? "block" : "none"}
                    position={"fixed"}
                    inset={0}
                    // bgColor={"#ff000033"}
                    onClick={() => {
                        setOpen(false)
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        setOpen(false)
                    }}
                />
                <Menu.Positioner>
                    <Menu.Content bgColor={"bg.2"}>
                        {commands.map((command) => {
                            if (command.toolbarOnly) return null
                            if (command.spacer) return <Menu.Separator key={command.id} />
                            const [display, disabled] = getCommandItemState(
                                command,
                                selected,
                                context,
                            )
                            return (
                                <Menu.Item
                                    inset={(() => {
                                        console.log("box box box")
                                        return 0
                                    })()}
                                    key={command.id}
                                    value={command.id}
                                    onClick={() => {
                                        command?.onClick(selected, context)
                                    }}
                                    display={display}
                                    disabled={disabled}
                                >
                                    {command.getLabel?.(selected, context) ?? command.label}
                                </Menu.Item>
                            )
                        })}
                    </Menu.Content>
                </Menu.Positioner>
            </Portal>
        </Menu.Root>
    )
}

/** returns the values for display and disabled */
function getCommandItemState<T, C = undefined>(
    command: ICommand<T, C>,
    selected: Snapshot<T[]>,
    context?: C,
): ["none" | undefined, boolean] {
    let enabled = true
    if (command.getEnabled) {
        enabled = command.getEnabled(selected, context)
    } else {
        if (command.requiresSelection && selected.length === 0) enabled = false
        else if (command.requiresSingleSelection && selected.length !== 1) enabled = false
        else if (command.requiresMultipleSelection && selected.length <= 1) enabled = false
    }

    if (enabled) return [undefined, false]
    if (command.menuEnableMode === "disable") return [undefined, true]
    return ["none", true]
}

export default CommandMenu
