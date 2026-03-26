import { HStack } from "@chakra-ui/react"
import { useEffect, useMemo, useRef } from "react"
import { proxy, type Snapshot, useSnapshot } from "valtio"
import { PiInfo } from "@/components/icons/icons"
import { type Selectable, useSelectableGroup } from "@/hooks/useSelectableV"
import type { ICommand } from "@/types"
import { PaneListContainer, PanelListItem, PanelSectionHeader, Tooltip } from "."
import CommandButton from "./CommandButton"
import { PaneListScrollContainer, PanelListScrollContent, PanelSection } from "./common"

interface PanelListComponentProps<T, C = undefined> extends ChakraProps {
    emptyListText?: string | boolean
    commands?: ICommand<T, C>[]
    commandContext?: C
    header?: string
    headerInfo?: string
    keyFn?: (item: T | Snapshot<T>) => string | number
    /** must be a valtio proxy (or a function that returns one) */
    itemsState: ValueOrGetter<T[]>
    onSelectionChanged?: (selected: T[]) => void
    clearSelection?: unknown
    selectionMode?: "multipleModifier" | "multipleToggle" | "single"
    variant?: "flat" | "inset"
}

function PanelList<T extends Selectable, C = undefined>(props: PanelListComponentProps<T, C>) {
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
        variant = "inset",
        ...boxProps
    } = props

    const itemsGetter = useMemo(() => {
        if (typeof itemsProp === "function") return itemsProp
        else return () => itemsProp ?? proxy([])
    }, [itemsProp])
    const items = itemsGetter()
    const itemsSnap = useSnapshot(items)

    const { SelectableGroup, selectedItems } = useSelectableGroup<T>(itemsSnap, itemsGetter, {
        mode: selectionMode,
        keyFn,
        onSelectionChanged,
    })

    const clearSelectionRef = useRef(clearSelection)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)

    // const scrollY = useRef(0)
    // const scrollYMv = useSpring(0, { mass: 1, stiffness: 210, damping: 25, visualDuration: 0.5 })

    useEffect(() => {
        if (clearSelection) {
            items.forEach((it) => {
                if (it.selected) {
                    it.setSelected(false)
                }
            })
        }
        clearSelectionRef.current = clearSelection
    }, [clearSelection, items])

    const areItemsSelected = selectedItems.length > 0
    const emptyListText =
        emptyListTextProp === false
            ? null
            : typeof emptyListTextProp === "string"
              ? emptyListTextProp
              : "(No items)"

    return (
        <PanelSection {...boxProps} variant={variant}>
            {header && (
                <PanelSectionHeader marginY={2} variant={variant}>
                    {header}
                    {headerInfo && (
                        <Tooltip tip={headerInfo}>
                            <PiInfo />
                        </Tooltip>
                    )}
                </PanelSectionHeader>
            )}
            <PaneListContainer variant={variant}>
                <PaneListScrollContainer
                    variant={variant}
                    ref={wrapperRef}
                    // overflowY="clip"
                    // onWheel={(e) => {
                    // 	if (!wrapperRef.current || !contentRef.current) return
                    // 	const max =
                    // 		contentRef.current?.clientHeight - wrapperRef.current?.clientHeight
                    // 	scrollY.current = Math.max(0, Math.min(max, scrollY.current + e.deltaY))
                    // 	scrollYMv.set(-scrollY.current)
                    // }}
                >
                    <PanelListScrollContent variant={variant} ref={contentRef} asChild>
                        <SelectableGroup>{children}</SelectableGroup>
                    </PanelListScrollContent>
                </PaneListScrollContainer>

                {!emptyListText && areItemsSelected && (
                    <PanelListItem
                        bgColor={"transparent"}
                        fontStyle={"italic"}
                        textAlign={"center"}
                        variant={variant}
                    >
                        {emptyListText}
                    </PanelListItem>
                )}

                <HStack justifyContent={"flex-end"} marginTop={"auto"} bottom={0}>
                    {commands?.map((command) => (
                        <CommandButton
                            key={command.id}
                            command={command}
                            selectedItems={selectedItems as T[]}
                            context={commandContext}
                        />
                    ))}
                </HStack>
            </PaneListContainer>
        </PanelSection>
    )
}

export default PanelList
