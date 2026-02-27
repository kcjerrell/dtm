import { HStack, Spacer } from "@chakra-ui/react"
import { type ComponentType, useEffect, useRef } from "react"
import type { Snapshot } from "valtio"
import type { IconType } from "@/components/icons/icons"
import { PiInfo } from "@/components/icons/icons"
import type { Selectable } from "@/hooks/useSelectableV"
import { IconButton, PaneListContainer, PanelListItem, PanelSectionHeader, Tooltip } from "."
import { PaneListScrollContainer, PanelListScrollContent, PanelSection } from "./common"

interface PanelListComponentProps<T, C = undefined> extends ChakraProps {
    emptyListText?: string | boolean
    commands?: PanelListCommandItem<T, C>[]
    commandContext?: C
    header?: string
    headerInfo?: string
    keyFn?: (item: T | Snapshot<T>) => string | number
    /** must be a valtio proxy (or a function that returns one) */
    itemsState: ValueOrGetter<T[]>
    onSelectionChanged?: (selected: T[]) => void
    clearSelection?: unknown
    selectionMode?: "multipleModifier" | "multipleToggle" | "single"
    selectedItems?: Snapshot<T[]>
}

export type PanelListCommandItem<T, C = undefined> = PanelListCommand<T, C> | "spacer"

export interface PanelListCommand<T, C = undefined> {
    id: string
    ariaLabel?: string
    icon?: IconType | ComponentType
    getIcon?: (selected: Snapshot<T[]>, context?: C) => IconType | ComponentType
    requiresSelection?: boolean
    requiresSingleSelection?: boolean
    getEnabled?: (selected: Snapshot<T[]>, context?: C) => boolean
    /** if present, tipTitle and tipText will be ignored */
    tip?: React.ReactNode
    tipTitle?: string
    tipText?: string
    getTip?: (selected: Snapshot<T[]>, context?: C) => React.ReactNode
    getTipTitle?: (selected: Snapshot<T[]>, context?: C) => string
    getTipText?: (selected: Snapshot<T[]>, context?: C) => string
    onClick: (selected: Snapshot<T[]>, context?: C) => void
}

function PanelList<T extends Selectable>(props: PanelListComponentProps<T>) {
    const {
        children,
        emptyListText: emptyListTextProp,
        commands,
        commandContext,
        header,
        headerInfo,
        keyFn,
        itemsState: itemsProp,
        onSelectionChanged,
        clearSelection,
        selectionMode = "multipleModifier",
        selectedItems = [],
        ...boxProps
    } = props

    const scrollContainerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = scrollContainerRef.current
        if (!el) return

        const update = () => {
            const canScrollTop = el.scrollTop > 0
            const canScrollBottom = el.scrollTop + el.clientHeight < el.scrollHeight

            el.dataset.top = canScrollTop ? "1" : "0"
            el.dataset.bottom = canScrollBottom ? "1" : "0"
        }

        update()
        el.addEventListener("scroll", update)

        const ro = new ResizeObserver(update)
        ro.observe(el)

        return () => {
            el.removeEventListener("scroll", update)
            ro.disconnect()
        }
    }, [])

    const areItemsSelected = selectedItems.length > 0

    const emptyListText =
        emptyListTextProp === false
            ? null
            : typeof emptyListTextProp === "string"
              ? emptyListTextProp
              : "(No items)"

    return (
        <PanelSection {...boxProps}>
            {header && (
                <PanelSectionHeader marginY={2}>
                    {header}
                    {headerInfo && (
                        <Tooltip tip={headerInfo}>
                            <PiInfo />
                        </Tooltip>
                    )}
                </PanelSectionHeader>
            )}
            <PaneListContainer>
                <PaneListScrollContainer
                    ref={scrollContainerRef}
                    id={"plcontiner"}
                    data-top="0"
                    data-bottom="0"
                    css={{
                        "--top": "0px",
                        "--bottom": "0px",

                        maskImage: `
      linear-gradient(
        to bottom,
        transparent,
        black var(--top),
        black calc(100% - var(--bottom)),
        transparent
      )
    `,
                        WebkitMaskImage: `
      linear-gradient(
        to bottom,
        transparent,
        black var(--top),
        black calc(100% - var(--bottom)),
        transparent
      )
    `,

                        '&[data-top="1"]': {
                            "--top": "16px",
                        },

                        '&[data-bottom="1"]': {
                            "--bottom": "16px",
                        },
                    }}
                >
                    <PanelListScrollContent id={"plcontent"}>{children}</PanelListScrollContent>
                </PaneListScrollContainer>

                {!emptyListText && (
                    <PanelListItem
                        bgColor={"transparent"}
                        fontStyle={"italic"}
                        textAlign={"center"}
                    >
                        {emptyListText}
                    </PanelListItem>
                )}

                <HStack justifyContent={"flex-end"} marginTop={"auto"} bottom={0}>
                    {commands?.map((command, i) => {
                        if (command === "spacer") return <Spacer key={`spacer-${i.toString()}`} />

                        let enabled = true
                        if (command.requiresSelection && !areItemsSelected) enabled = false
                        if (command.requiresSingleSelection && selectedItems.length !== 1)
                            enabled = false
                        if (command.getEnabled)
                            enabled = command.getEnabled(selectedItems, commandContext)

                        const Icon = command.getIcon
                            ? command.getIcon(selectedItems, commandContext)
                            : command.icon
                        const tip = command.getTip
                            ? command.getTip(selectedItems, commandContext)
                            : command.tip
                        const tipTitle = command.getTipTitle
                            ? command.getTipTitle(selectedItems, commandContext)
                            : command.tipTitle
                        const tipText = command.getTipText
                            ? command.getTipText(selectedItems, commandContext)
                            : command.tipText

                        return (
                            <IconButton
                                aria-label={command.ariaLabel}
                                key={command.id}
                                size={"sm"}
                                onClick={() => command.onClick(selectedItems, commandContext)}
                                disabled={!enabled}
                                tip={tip}
                                tipTitle={tipTitle}
                                tipText={tipText}
                            >
                                {Icon && <Icon />}
                            </IconButton>
                        )
                    })}
                </HStack>
            </PaneListContainer>
        </PanelSection>
    )
}

export default PanelList
