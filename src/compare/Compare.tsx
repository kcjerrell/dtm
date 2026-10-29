import { Box, Grid, HStack, Icon, Image } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import { type ComponentProps, useCallback, useRef, useState } from "react"
import { RiLayoutColumnFill } from "react-icons/ri"
import type { Snapshot } from "valtio"
import { useSnapshot } from "valtio/react"
import { IconButton, Panel } from "@/components"
import { PanelSectionHeader } from "@/components/common"
import ImageCompare from "@/components/imageCompare"
import { useTimeout } from "@/hooks/useTimeout"
import { type CompareItem, useCompareStore } from "./state"
import { IconButtonProps } from "@/components/IconButton"

const TEST_PATH_ROOT =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/"
const TEST_IMAGES = [
    "38dzby284dv6.png",
    "vm0kgvlpyklm.jpg",
    "bhdlwrwhdnd9.png",
    "cf68acpkwowm.png",
].map((n) => TEST_PATH_ROOT + n)
const [_TEST_IMG_A, _TEST_IMG_B] = [TEST_IMAGES[2], TEST_IMAGES[3]]

type ImageSide = "A" | "B"

function Compare() {
    // const { state, snap } = useProxyRef(() => ({
    //     imgA: null as string | null,
    //     imgB: null as string | null,
    // }))

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

    const { state, selectItem, collection } = useCompareStore()
    // const images = store.collection.useMapItems()
    const snap = useSnapshot(state)
    const items = collection.useMapItems()
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
                        width={"40%"}
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
                                            if (!isOpen) return
                                            await selectItem(item, isOpen)
                                            // const side = `image${isOpen}` as keyof typeof state
                                            // if (side in state) state[side] = item.id
                                        }}
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
}

function ImageItem(props: ImageItemProps) {
    const { isA, isB, item, index, gridRow, gridColumn, onSelectSide, ...restProps } = props
    const [isHovered, setIsHovered] = useState(false)
    const controlsRef = useRef<HTMLDivElement>(null)

    const showAButton = isHovered || isA
    const showBButton = isHovered || isB

    return (
        <>
            <Image
                src={item.url}
                alt={`Image ${index + 1}`}
                width={"full"}
                aspectRatio={1}
                alignSelf={"start"}
                objectFit={"cover"}
                gridRow={gridRow}
                gridColumn={gridColumn}
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
                {...restProps}
            />
            <AnimatePresence>
                {(showAButton || showBButton) && (
                    <HStack
                        ref={controlsRef}
                        gridRow={gridRow}
                        gridColumn={gridColumn}
                        alignSelf={"end"}
                        zIndex={1}
                        gap={0}
                        padding={0}
                        marginBottom={0}
                        marginX={"auto"}
                        onMouseLeave={() => setIsHovered(false)}
                        borderRadius={"lg"}
                        asChild
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <AnimatePresence>
                                <ImageABButton
                                    key={`${index}A`}
                                    index={index}
                                    side={"A"}
                                    isSelected={isA}
                                    onClick={() => onSelectSide("A", isA)}
                                    show={showAButton}
                                    solo={showAButton && !showBButton}
                                />
                                <ImageABButton
                                    key={`${index}B`}
                                    index={index}
                                    side={"B"}
                                    isSelected={isB}
                                    onClick={() => onSelectSide("B", isB)}
                                    show={showBButton}
                                    solo={showBButton && !showAButton}
                                />
                            </AnimatePresence>
                        </motion.div>
                    </HStack>
                )}
                {/*{!isHovered && isA && <motion.div layoutId={`${item.id}-A`}>A</motion.div>}*/}
            </AnimatePresence>
        </>
    )
}

interface ImageABButtonProps extends ComponentProps<typeof IconButton> {
    index: number
    side: "A" | "B"
    isSelected?: boolean
    show?: boolean
    solo?: boolean
}

const selectedProps: IconButtonProps = {
    bgColor: "color-mix(in srgb, {colors.grays.12} 20%, var(--compare-img-side-color) 80%)",
    color: "grays.3",
}

function ImageABButton(props: ImageABButtonProps) {
    const { index, side, isSelected, show, solo, ...restProps } = props

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
            opacity={show ? 1 : 0}
            aria-label={`Select image ${index + 1} for ${side}`}
            aria-pressed={isSelected}
            color={`{colors.${sideColor}.500}`}
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
