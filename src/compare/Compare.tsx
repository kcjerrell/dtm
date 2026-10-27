import { Box, Grid, HStack, Icon, Image } from "@chakra-ui/react"
import { useCallback, useState } from "react"
import { RiLayoutColumnFill } from "react-icons/ri"
import { useSnapshot } from "valtio/react"
import { IconButton, Panel } from "@/components"
import { PanelSectionHeader } from "@/components/common"
import ImageCompare from "@/components/imageCompare"
import { useTimeout } from "@/hooks/useTimeout"
import { CompareItem, useCompareStore } from "./state"
import { Snapshot } from "valtio"

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

    const { state, selectItem } = useCompareStore()
    // const images = store.collection.useMapItems()
    const snap = useSnapshot(state)

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
                            gridTemplateColumns={`repeat(${snap.items.length < 6 ? 2 : 3}, 1fr)`}
                            gap={"3px"}
                            minHeight={0}
                            overflowY={"auto"}
                        >
                            {snap.items.map((item, i) => {
                                const isA = snap.imageA?.id === item.id
                                const isB = snap.imageB?.id === item.id
                                return (
                                    <ImageItem
                                        key={item.id}
                                        item={item}
                                        index={i}
                                        isA={isA}
                                        isB={isB}
                                        onClick={() => {
                                            if (!isOpen) return
                                            selectItem(item, isOpen)
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
}

function ImageItem(props: ImageItemProps) {
    const { isA, isB, item, index, ...restProps } = props

    return (
        <Image
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
            {...restProps}
        />
    )
}

export default Compare
