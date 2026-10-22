import { Box, Grid, HStack, Icon, Image } from "@chakra-ui/react"
import { useCallback, useState } from "react"
import { RiLayoutColumnFill } from "react-icons/ri"
import { useSnapshot } from "valtio/react"
import { computed } from "valtio-reactive"
import { CheckRoot, IconButton, Panel } from "@/components"
import { PanelSectionHeader } from "@/components/common"
import ImageCompare from "@/components/imageCompare"
import { useTimeout } from "@/hooks/useTimeout"
import { useProxyRef } from "@/hooks/valtioHooks"
import { useMetadataStore } from "@/metadata/state/metadataStore2"
import ImageSelector from "./ImageSelector"

const TEST_PATH_ROOT =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/"
const TEST_IMAGES = [
    "38dzby284dv6.png",
    "vm0kgvlpyklm.jpg",
    "bhdlwrwhdnd9.png",
    "cf68acpkwowm.png",
].map((n) => TEST_PATH_ROOT + n)
const [TEST_IMG_A, TEST_IMG_B] = [TEST_IMAGES[2], TEST_IMAGES[3]]

type ImageSide = "A" | "B"

function Compare() {
    const { state, snap } = useProxyRef(() => ({
        imgA: null as string | null,
        imgB: null as string | null,
    }))

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

    const store = useMetadataStore()
    // const images = store.collection.useMapItems()
    const itemsSnap = useSnapshot(store.state.items)

    const selectedImages = computed({
        a: () => (state.imgA ? store.state.items.find((item) => item.id === state.imgA) : null),
        b: () => (state.imgB ? store.state.items.find((item) => item.id === state.imgB) : null),
    })
    const selectedSnap = useSnapshot(selectedImages)

    return (
        <Box width={"full"} height={"full"} padding={0}>
            <ImageCompare.Root
                a={selectedSnap.a?.url}
                b={selectedSnap.b?.url}
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
                            gridTemplateColumns={`repeat(${itemsSnap.length < 6 ? 2 : 3}, 1fr)`}
                            gap={"3px"}
                            minHeight={0}
                            overflowY={"auto"}
                        >
                            {itemsSnap.map((item, i) => {
                                const isA = snap.imgA === item.id
                                const isB = snap.imgB === item.id
                                const isSelected = isA || isB
                                return (
                                    <Image
                                        key={item.id}
                                        src={item.url}
                                        alt={`Image ${i + 1}`}
                                        width={"full"}
                                        aspectRatio={1}
                                        alignSelf={"start"}
                                        objectFit={"cover"}
                                        onClick={() => {
                                            const side = `img${isOpen}` as keyof typeof state
                                            if (side in state) state[side] = item.id
                                        }}
                                        borderStyle={"solid"}
                                        borderColor={
                                            isA ? "red.400" : isB ? "blue.400" : "transparent"
                                        }
                                        borderRightColor={isB ? "blue.400" : undefined}
                                        borderBottomColor={isB ? "blue.400" : undefined}
                                        borderWidth={isSelected ? "2px" : "0px"}
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

export default Compare
