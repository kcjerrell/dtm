import { Box, Grid, HStack, Image } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import { type ComponentProps, useCallback, useEffect, useRef } from "react"
import { IoArrowUndoOutline, IoTrashOutline } from "react-icons/io5"
import type { Snapshot } from "valtio"
import { useSnapshot } from "valtio/react"
import { IconButton, Panel } from "@/components"
import type { IconButtonProps } from "@/components/IconButton"
import { FiX, PiImage } from "@/components/icons/icons"
import ImageCompare from "@/components/imageCompare"
import { useTimeout } from "@/hooks/useTimeout"
import PinnedIcon from "@/metadata/toolbar/PinnedIcon"
import { type CompareItem, useCompareStore } from "./state"

type ImageSide = "A" | "B"

function Compare() {
    const panelRef = useRef<HTMLDivElement>(null)

    const { state, selectItem, collection, removeItem, pinItem } = useCompareStore()
    const snap = useSnapshot(state)

    const [startCloseTimer, cancelCloseTimer] = useTimeout({
        fn: () => {
            state.isSelectorOpen = false
        },
        delay: 600,
    })

    const onEnter = useCallback(() => {
        cancelCloseTimer()
        state.isSelectorOpen = true
    }, [cancelCloseTimer, state])

    const items = collection
        .useItemsSnap()
        .filter((item) => !snap.softRemovedItems.has(item.id))
        .toSorted(
            (a, b) => (a.pin || Number.POSITIVE_INFINITY) - (b.pin || Number.POSITIVE_INFINITY),
        )

    const hasPinnedItems = !!items.at(0)?.pin
    const hasUnpinnedItems = !items.at(-1)?.pin

    // find the index to insert the gap between pin and unpinned
    const gapIndex = items.findIndex((item) => !item.pin) + 1 || items.length + 1

    return (
        <Box width={"full"} height={"full"} padding={0}>
            <ImageCompare.Root
                a={snap.imageA?.url}
                b={snap.imageB?.url}
                toolbarProps={{ bgColor: "bg.1" }}
            >
                <ImageCompare.ImageSelector image={"A"}>
                    <IconButton
                        variant="toolbar"
                        onClick={() => onEnter()}
                        tbOpen={snap.isSelectorOpen}
                        aria-expanded={snap.isSelectorOpen}
                        onMouseEnter={() => onEnter()}
                        onMouseLeave={() => startCloseTimer()}
                    >
                        <PiImage />
                    </IconButton>
                </ImageCompare.ImageSelector>

                <ImageCompare.TopLayer show={snap.isSelectorOpen}>
                    <Panel
                        ref={panelRef}
                        variant={"float"}
                        alignSelf={"end"}
                        justifySelf={"end"}
                        margin={2}
                        minWidth={"45%"}
                        maxWidth={"75%"}
                        maxHeight={"80%"}
                        minHeight={`${panelRef.current?.getBoundingClientRect()?.height ?? 0}px`}
                        overflow={"auto"}
                        className={"panel-scroll"}
                        onMouseEnter={() => onEnter()}
                        onMouseLeave={() => startCloseTimer()}
                        border={"1px solid"}
                        borderColor={"grayc.10"}
                        zIndex={50}
                    >
                        <Grid
                            // gridTemplateColumns={`repeat(auto-fit, minmax(min(calc(33% - 3px), 150px), 1fr))`}
                            gridTemplateColumns={`repeat(auto-fit, minmax(150px, 1fr))`}
                            gap={"3px"}
                            minHeight={0}
                            // overflowY={"auto"}
                        >
                            <AnimatePresence>
                                <HStack
                                    order={gapIndex}
                                    key={"sep"}
                                    gridColumn={"1 / -1"}
                                    gap={0}
                                    alignItems={"center"}
                                >
                                    <Box
                                        bgColor={"fg.3"}
                                        height={"1px"}
                                        marginX={2}
                                        flex={"1 0 0"}
                                        opacity={0.5}
                                    />
                                    <ClearPinsButton
                                        hasPinnedItems={hasPinnedItems}
                                        // h={"20px"}
                                        // minHeight={0}
                                        paddingY={0}
                                    />
                                    <ClearItemsButton
                                        hasUnpinnedItems={hasUnpinnedItems}
                                        // h={"20px"}
                                        // minHeight={0}
                                        paddingY={0}
                                    />
                                </HStack>
                                {items.map((item, i) => {
                                    const isA = snap.imageA?.id === item.id
                                    const isB = snap.imageB?.id === item.id
                                    return (
                                        <ImageItem
                                            order={i + 1}
                                            key={item.id}
                                            item={item}
                                            index={i}
                                            onSelectSide={async (side, clear) =>
                                                await selectItem(clear ? undefined : item, side)
                                            }
                                            isA={isA}
                                            isB={isB}
                                            onClick={async () => {
                                                selectItem(item, "firstEmptyOrB")
                                            }}
                                            onRemoveItem={() => removeItem(item)}
                                            onPinItem={() => pinItem(item.id, !item.pin)}
                                        />
                                    )
                                })}
                            </AnimatePresence>
                        </Grid>
                    </Panel>
                </ImageCompare.TopLayer>
            </ImageCompare.Root>
        </Box>
    )
}

interface ImageItemProps extends ChakraProps {
    isA?: boolean
    isB?: boolean
    item: Snapshot<CompareItem>
    index: number
    onSelectSide: (side: ImageSide, clear?: boolean) => void
    onRemoveItem: () => void
    onPinItem: () => void
}

interface ClearItemsButtonProps extends ComponentProps<typeof IconButton> {
    hasUnpinnedItems?: boolean
}

function ClearItemsButton(props: ClearItemsButtonProps) {
    const { hasUnpinnedItems, ...restProps } = props
    const { state, collection, selectItem } = useCompareStore()
    const snap = useSnapshot(state)

    const showUndo = !!snap.softRemovedItems.size

    const isOpen = snap.isSelectorOpen
    useEffect(() => {
        if (isOpen) return
        if (state.softRemovedItems.size) {
            collection.removeItems([...state.softRemovedItems.values()])
            state.softRemovedItems.clear()
        }
    }, [collection, state, isOpen])

    return (
        <IconButton
            aria-label={showUndo ? "Undo clear images" : "Clear images"}
            tipTitle={showUndo ? "Undo clear images" : "Clear images"}
            size={"sm"}
            minWidth={"unset"}
            height={"unset"}
            padding={0.5}
            borderRadius={"0.5rem"}
            marginX={0.5}
            display={hasUnpinnedItems || showUndo ? undefined : "none"}
            onClick={() => {
                if (state.softRemovedItems.size > 0) {
                    state.softRemovedItems.clear()
                } else {
                    for (const item of state.items) {
                        if (!item.pin) state.softRemovedItems.add(item.id)
                    }
                    if (state.imageA && state.softRemovedItems.has(state.imageA.id))
                        selectItem(undefined, "A")
                    if (state.imageB && state.softRemovedItems.has(state.imageB.id))
                        selectItem(undefined, "B")
                }
            }}
            {...restProps}
            paddingBlock={0}
        >
            {showUndo ? <IoArrowUndoOutline /> : <IoTrashOutline />}
        </IconButton>
    )
}

interface ClearPinsButtonProps extends ComponentProps<typeof IconButton> {
    hasPinnedItems?: boolean
}

function ClearPinsButton(props: ClearPinsButtonProps) {
    const { hasPinnedItems, ...restProps } = props
    const { state, pinItem, clearPins } = useCompareStore()
    const snap = useSnapshot(state)

    const showUndo = !!snap.clearPinsUndo.size

    const isOpen = snap.isSelectorOpen
    useEffect(() => {
        if (isOpen) return
        if (state.clearPinsUndo.size) {
            state.clearPinsUndo.clear()
        }
    }, [state, isOpen])

    return (
        <IconButton
            aria-label={showUndo ? "Undo reset pins" : "Reset pins"}
            tipTitle={showUndo ? "Undo reset pins" : "Reset pins"}
            size={"sm"}
            strike={!showUndo}
            display={hasPinnedItems || showUndo ? undefined : "none"}
            minWidth={"unset"}
            height={"unset"}
            padding={0.5}
            borderRadius={"0.5rem"}
            marginX={0.5}
            onClick={() => {
                if (showUndo) {
                    // copying because changing a pin clears the undo
                    const pins = [...state.clearPinsUndo.entries()].sort(
                        ([_a, a], [_b, b]) => a - b,
                    )
                    for (const [id, pin] of pins) {
                        if (pin) pinItem(id, true)
                    }
                    state.clearPinsUndo.clear()
                } else {
                    for (const item of state.items) {
                        if (item.pin) state.clearPinsUndo.set(item.id, item.pin)
                    }
                    clearPins()
                }
            }}
            {...restProps}
        >
            {showUndo ? <IoArrowUndoOutline /> : <PinnedIcon pin={null} />}
        </IconButton>
    )
}

function ImageItem(props: ImageItemProps) {
    const { isA, isB, item, index, onSelectSide, onRemoveItem, onPinItem, ...restProps } = props

    return (
        <Box
            width={"100%"}
            height={"100%"}
            position={"relative"}
            className={"group"}
            {...restProps}
            asChild
        >
            <motion.div exit={{ scale: 0 }} transition={{ duration: 0.2 }}>
                <Image
                    inset={0}
                    src={item.url}
                    alt={`Image ${index + 1}`}
                    width={"full"}
                    aspectRatio={1}
                    alignSelf={"start"}
                    objectFit={"cover"}
                    borderStyle={"solid"}
                    borderColor={isA ? "red.400" : isB ? "blue.400" : "transparent"}
                    borderRightColor={isB ? "blue.400" : undefined}
                    borderBottomColor={isB ? "blue.400" : undefined}
                    borderWidth={isA || isB ? "2px" : "0px"}
                />
                <IconButton
                    css={{
                        "--hover-bg": "colors.transparent",
                        "--hover-borders": "colors.transparent",
                        "--hover-shadow": "colors.transparent",
                    }}
                    size={"sm"}
                    position={"absolute"}
                    top={0}
                    left={0}
                    opacity={0}
                    _groupHover={{ opacity: 1 }}
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemoveItem()
                    }}
                    tipTitle={"Remove item"}
                    color={"grays.14"}
                    filter={
                        "drop-shadow(0 1px 1px rgba(0,0,0,1)) drop-shadow(0px 0px 4px rgba(0.2,0.2,0.2,0.5)) drop-shadow(0 -1px 1px rgba(0,0,0,1))"
                    }
                    // transformOrigin={"top left"}
                    // _hover={{ scale: 1.1 }}
                    transition={"all 0.2s ease"}
                >
                    <FiX />
                </IconButton>
                <IconButton
                    css={{
                        "--hover-bg": "colors.transparent",
                        "--hover-borders": "colors.transparent",
                        "--hover-shadow": "colors.transparent",
                    }}
                    tipTitle={"Pin item"}
                    size={"sm"}
                    position={"absolute"}
                    top={0}
                    right={0}
                    opacity={item.pin ? 1 : 0}
                    _groupHover={{ opacity: 1 }}
                    onClick={(e) => {
                        e.stopPropagation()
                        onPinItem()
                    }}
                    color={"grays.14"}
                    // transformOrigin={"top right"}
                    // _hover={{ scale: 1.1 }}
                    transition={"all 0.2s ease"}
                >
                    <PinnedIcon
                        pin={item.pin}
                        filter={
                            "drop-shadow(0 0 1px rgba(0,0,0,1)) drop-shadow(0 0px 3px rgba(0.2,0.2,0.2,1))"
                        }
                    />
                </IconButton>
                <ImageABButton
                    position={"absolute"}
                    bottom={0}
                    left={"50%"}
                    translate={"-100% 0%"}
                    key={`${index}A`}
                    index={index}
                    side={"A"}
                    isSelected={isA}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSelectSide("A", isA)
                    }}
                    solo={isA && !isB}
                />
                <ImageABButton
                    position={"absolute"}
                    bottom={0}
                    right={"50%"}
                    translate={"100% 0%"}
                    key={`${index}B`}
                    index={index}
                    side={"B"}
                    isSelected={isB}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSelectSide("B", isB)
                    }}
                    solo={isB && !isA}
                />
            </motion.div>
        </Box>
    )
}

interface ImageABButtonProps extends ComponentProps<typeof IconButton> {
    index: number
    side: "A" | "B"
    isSelected?: boolean
    solo?: boolean
}

const selectedProps: IconButtonProps = {
    bgColor: "color-mix(in srgb, {colors.grays.12} 20%, var(--compare-img-side-color) 80%)",
    color: "grays.3",
    // borderColor: "grays.3",
}

function ImageABButton(props: ImageABButtonProps) {
    const { index, side, isSelected, solo, ...restProps } = props

    // const color = `${side === "A" ? "red" : "blue"}.400/${isSelected ? "100" : "50"}`
    const sideColor = side === "A" ? "red" : "blue"
    // const mix = isSelected ? 90 : 20
    // const color = `color-mix(in srgb, {colors.grays.12} ${100 - mix}%, {colors.${sideColor}.500} ${100}%)`

    const stateProps = isSelected ? selectedProps : {}

    return (
        <IconButton
            css={{
                "--compare-img-side-color": `{colors.${sideColor}.500}`,
            }}
            // size={"xs"}
            minWidth={"1.5rem"}
            width={"1.5rem"}
            minHeight={"1.5rem"}
            height={"1.5rem"}
            fontSize={"1rem"}
            // visibility={show ? "visible" : "hidden"}
            opacity={isSelected ? 1 : 0}
            _groupHover={{
                opacity: 1,
                borderTopLeftRadius: side === "A" ? undefined : "none",
                borderTopRightRadius: side === "B" ? undefined : "none",
            }}
            _hover={{
                scale: "1.1",
            }}
            transformOrigin={side === "A" ? "bottom right" : "bottom left"}
            aria-label={`Select image ${index + 1} for ${side}`}
            aria-pressed={isSelected}
            color={`{colors.${sideColor}.400}`}
            bgColor={"grays.4/80"}
            border={isSelected ? "none" : `1px solid`}
            borderBottom={"0px"}
            borderLeft={side === "B" ? "0px" : "1px solid"}
            borderRight={side === "A" ? "0px" : "1px solid"}
            borderColor={`{colors.${sideColor}.500}/70`}
            // boxShadow={ "0px 0px 2px 0px #000000"
            // !solo
            //     ? "0px 0px 2px 0px #00FF00"
            //     : side === "A"
            //       ? "-1px -1px 3px -1px #FF0000"
            //       : "1px -1px 3px -1px #0000FF"
            // }
            transition={"all 0.2s ease"}
            // _hover={{ color: "grays.3", bgColor: color
            {...stateProps}
            {...getBorderRadius(side, solo)}
            {...restProps}
        >
            {side}
        </IconButton>
    )
}

function getBorderRadius(side: "A" | "B", solo?: boolean) {
    return {
        borderBottomRadius: "none",
        borderTopLeftRadius: side === "A" || solo ? "lg" : "none",
        borderTopRightRadius: side === "B" || solo ? "lg" : "none",
    }
}

export default Compare
