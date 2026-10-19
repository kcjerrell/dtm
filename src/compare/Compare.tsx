import { CheckRoot, IconButton, Panel } from "@/components"
import ImageCompare from "@/components/imageCompare"
import { Box, Grid, Icon, Image } from "@chakra-ui/react"
import ImageSelector from "./ImageSelector"
import { useCallback, useState } from "react"
import { useTimeout } from "@/hooks/useTimeout"
import { useMetadataStore } from "@/metadata/state/metadataStore2"
import { RiLayoutColumnFill } from "react-icons/ri"
import { PanelSectionHeader } from "@/components/common"
import { useSnapshot } from "valtio/react"
import { useProxyRef } from "@/hooks/valtioHooks"
import { computed } from "valtio-reactive"

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
                        width={"20rem"}
                        height={"50%"}
                        onMouseEnter={() => (isOpen ? onEnter(isOpen) : void 0)}
                        onMouseLeave={() => startCloseTimer()}
                    >
                        <PanelSectionHeader
                            justifyContent={"start"}
                            fontSize={"md"}
                            color={"fg.1"}
                            padding={1}
                            gap={2}
                        >
                            <Icon
                                transform={isOpen === "B" ? "rotateY(180deg)" : "rotateY(0deg)"}
                                transition={"transform 0.2s ease-in-out"}
                            >
                                <RiLayoutColumnFill size={"1.5rem"} />
                            </Icon>
                            Image {isOpen}
                        </PanelSectionHeader>
                        <Grid gridTemplateColumns={"repeat(3, 1fr)"} gap={"3px"}>
                            {itemsSnap.map((item, i) => {
                                const isSelected = snap.imgA === item.id || snap.imgB === item.id
                                console.log(isSelected)
                                return (
                                    <Image
                                        key={item.id}
                                        src={item.url}
                                        alt={i}
                                        objectFit={"cover"}
                                        onClick={() => {
                                            console.log(item.id)
                                            const side = `img${isOpen}` as keyof typeof state
                                            if (side in state) state[side] = item.id
                                        }}
                                        border={"solid red"}
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
