import { CheckRoot } from "@/components"
import ImageCompare from "@/components/imageCompare"
import { Box } from "@chakra-ui/react"

const TEST_PATH_ROOT =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/"
const TEST_IMAGES = [
    "38dzby284dv6.png",
    "vm0kgvlpyklm.jpg",
    "bhdlwrwhdnd9.png",
    "cf68acpkwowm.png",
].map((n) => TEST_PATH_ROOT + n)
const [TEST_IMG_A, TEST_IMG_B] = [TEST_IMAGES[2], TEST_IMAGES[3]]

function Empty() {
    return (
        <Box width={"full"} height={"full"} padding={0} css={{ "& img": { padding: "1rem" } }}>
            <ImageCompare.Root a={TEST_IMG_A} b={TEST_IMG_B} toolbarProps={{ bgColor: "bg.1" }}>
                <ImageCompare.ImageSelector image={"a"}>Hello</ImageCompare.ImageSelector>
                <ImageCompare.ImageSelector image={"b"}>Goodbye</ImageCompare.ImageSelector>
            </ImageCompare.Root>
        </Box>
    )
}

export default Empty
