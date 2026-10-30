import { Box, Grid, HStack, Icon, Image } from "@chakra-ui/react"
import { type ComponentProps, useCallback, useRef, useState } from "react"
import { RiLayoutColumnFill } from "react-icons/ri"
import type { Snapshot } from "valtio"
import { useSnapshot } from "valtio/react"
import { IconButton, Panel } from "@/components"
import { PanelSectionHeader } from "@/components/common"
import type { IconButtonProps } from "@/components/IconButton"
import { FiX } from "@/components/icons/icons"
import ImageCompare from "@/components/imageCompare"
import { useTimeout } from "@/hooks/useTimeout"
import PinnedIcon from "@/metadata/toolbar/PinnedIcon"
import { type CompareItem, useCompareStore } from "./state"

type ImageSide = "A" | "B"

let lastItems = [] as unknown[]

function Compare() {
    const [isOpen, setIsOpen] = useState<ImageSide | null>(null)
    const [startCloseTimer, cancelCloseTimer] = useTimeout({
        fn: () => setIsOpen(null),
        delay: 600,
    })

    const onEnter = useCallback(
        (side: ImageSide) => {
            cancelCloseTimer()
            setIsOpen(side)
        },
        [cancelCloseTimer],
    )

    const { state, selectItem, collection, removeItem, pinItem } = useCompareStore()
    // const images = store.collection.useMapItems()
    const snap = useSnapshot(state)
    const items = collection
        .useItemsSnap()
        .toSorted(
            (a, b) => (a.pin || Number.POSITIVE_INFINITY) - (b.pin || Number.POSITIVE_INFINITY),
        )

    if (items !== lastItems) {
        console.log("ident change")
        lastItems = items
    } else {
        console.log("render no change")
    }

    const columns = 3 // snap.items.length < 6 ? 2 : 3

    // const selectedImages = computed({
    //     a: () => (state.imgA ? store.state.items.find((item) => item.id === state.imgA) : null),
    //     b: () => (state.imgB ? store.state.items.find((item) => item.id === state.imgB) : null),
    // })
    // const selectedSnap = useSnapshot(selectedImages)

    return (
        <Box width={"full"} height={"full"} padding={0}>
            <ImageCompare.Root
                a={snap.imageA?.url}
                b={snap.imageB?.url}
                imageProps={{ padding: "1rem" }}
                toolbarProps={{ bgColor: "bg.1" }}
            >
                <ImageCompare.ImageSelector image={"a"}>
                    <IconButton
                        color={"red.400"}
                        _hover={{ color: "red.400" }}
                        onClick={() => onEnter("A")}
                        aria-expanded={isOpen === "A"}
                        onMouseEnter={() => onEnter("A")}
                        onMouseLeave={() => startCloseTimer()}
                    >
                        A
                    </IconButton>
                </ImageCompare.ImageSelector>
                <ImageCompare.ImageSelector image={"b"}>
                    {" "}
                    <ImageCompare.ImageSelector image={"b"}>
                        <IconButton
                            color={"blue.400"}
                            _hover={{ color: "blue.400" }}
                            onClick={() => onEnter("B")}
                            aria-expanded={isOpen === "B"}
                            onMouseEnter={() => onEnter("B")}
                            onMouseLeave={() => startCloseTimer()}
                        >
                            B
                        </IconButton>
                    </ImageCompare.ImageSelector>
                </ImageCompare.ImageSelector>

                <ImageCompare.TopLayer show={!!isOpen}>
                    <Panel
                        variant={"float"}
                        alignSelf={"end"}
                        justifySelf={"end"}
                        margin={2}
                        width={"45%"}
                        maxHeight={"70%"}
                        minHeight={0}
                        overflow={"hidden"}
                        onMouseEnter={() => (isOpen ? onEnter(isOpen) : void 0)}
                        onMouseLeave={() => startCloseTimer()}
                    >
                        <HStack justifyContent={"space-between"}>
                            {(["A", "B"] as const).map((side) => {
                                const color = side === "A" ? "red.400" : "blue.400"
                                const active = isOpen === side
                                return (
                                    <PanelSectionHeader
                                        key={side}
                                        asChild
                                        justifyContent={"start"}
                                        fontSize={"md"}
                                        color={color}
                                        padding={1}
                                        gap={2}
                                        borderRadius={"sm"}
                                        borderWidth={"1px"}
                                        borderColor={active ? color : "transparent"}
                                        bg={active ? `${color}/15` : "transparent"}
                                        fontWeight={active ? "bold" : "medium"}
                                    >
                                        <button
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setIsOpen(side)}
                                        >
                                            <Icon>
                                                <RiLayoutColumnFill size={"1.5rem"} />
                                            </Icon>
                                            {side}
                                        </button>
                                    </PanelSectionHeader>
                                )
                            })}
                        </HStack>
                        <Grid
                            gridTemplateColumns={`repeat(${columns}, 1fr)`}
                            gap={"3px"}
                            minHeight={0}
                            overflowY={"auto"}
                        >
                            {items.map((item, i) => {
                                const isA = snap.imageA?.id === item.id
                                const isB = snap.imageB?.id === item.id
                                return (
                                    <ImageItem
                                        key={item.id}
                                        item={item}
                                        index={i}
                                        gridRow={Math.floor(i / columns) + 1}
                                        gridColumn={(i % columns) + 1}
                                        onSelectSide={async (side, clear) =>
                                            await selectItem(clear ? undefined : item, side)
                                        }
                                        isA={isA}
                                        isB={isB}
                                        onClick={async () => {
                                            // if (!isOpen) return
                                            // await selectItem(item, isOpen)
                                            // const side = `image${isOpen}` as keyof typeof state
                                            // if (side in state) state[side] = item.id
                                        }}
                                        onRemoveItem={() => removeItem(item)}
                                        onPinItem={() => pinItem(item.id, !item.pin)}
                                    />
                                )
                            })}
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

function ImageItem(props: ImageItemProps) {
    const { isA, isB, item, index, onSelectSide, onRemoveItem, onPinItem, ...restProps } = props
    const [isHovered, setIsHovered] = useState(false)
    const controlsRef = useRef<HTMLDivElement>(null)

    const showAButton = isHovered || isA
    const showBButton = isHovered || isB

    return (
        <Box
            width={"100%"}
            height={"100%"}
            position={"relative"}
            className={"group"}
            {...restProps}
        >
            <Image
                // position={"absolute"}
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
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={(event) => {
                    if (
                        !(
                            event.relatedTarget instanceof Node &&
                            controlsRef.current?.contains(event.relatedTarget)
                        )
                    ) {
                        setIsHovered(false)
                    }
                }}
            />
            {/*<AnimatePresence>*/}
            {/*{isHovered && (*/}
            <IconButton
                // gridRow={gridRow}
                // gridColumn={gridColumn}
                // alignSelf={"start"}
                // justifySelf={"start"}
                position={"absolute"}
                top={0}
                left={0}
                visibility={"hidden"}
                _groupHover={{ visibility: "visible" }}
                onClick={() => onRemoveItem()}
            >
                <FiX />
            </IconButton>
            <IconButton
                css={{
                    "--hover-bg": "colors.transparent",
                    "--hover-borders": "colors.transparent",
                    "--hover-shadow": "colors.transparent",
                }}
                size={"xs"}
                position={"absolute"}
                top={0}
                right={0}
                visibility={item.pin ? "visible" : "hidden"}
                _groupHover={{ visibility: "visible" }}
                onClick={() => onPinItem()}
                color={"grays.14"}
            >
                <PinnedIcon
                    pin={item.pin}
                    filter={
                        "drop-shadow(0 0 1px rgba(0,0,0,1)) drop-shadow(0 0px 3px rgba(0.2,0.2,0.2,1))"
                    }
                />
            </IconButton>
            {/*)}*/}
            <HStack
                ref={controlsRef}
                position={"absolute"}
                bottom={0}
                left={"50%"}
                transform={"translateX(-50%)"}
                zIndex={1}
                gap={0}
                padding={0}
                borderRadius={"lg"}
            >
                <ImageABButton
                    key={`${index}A`}
                    index={index}
                    side={"A"}
                    isSelected={isA}
                    onClick={() => onSelectSide("A", isA)}
                    solo={showAButton && !showBButton}
                />
                <ImageABButton
                    key={`${index}B`}
                    index={index}
                    side={"B"}
                    isSelected={isB}
                    onClick={() => onSelectSide("B", isB)}
                    solo={showBButton && !showAButton}
                />
            </HStack>
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
            // visibility={show ? "visible" : "hidden"}
            opacity={isSelected ? 1 : 0}
            _groupHover={{ opacity: 1 }}
            aria-label={`Select image ${index + 1} for ${side}`}
            aria-pressed={isSelected}
            color={`{colors.${sideColor}.400}`}
            bgColor={"grays.4"}
            border={isSelected ? "none" : `1px solid`}
            borderBottom={"0px"}
            borderLeft={side === "B" ? "0px" : "1px solid"}
            borderRight={side === "A" ? "0px" : "1px solid"}
            borderColor={`{colors.${sideColor}.500}/70`}
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
