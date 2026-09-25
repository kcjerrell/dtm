import { motion } from "motion/react"
import { CheckRoot, Panel } from "@/components"
import ImageCompare from "@/components/imageCompare"

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
        <CheckRoot width={"full"} height={"full"} padding={0}>
                <ImageCompare a={TEST_IMG_A} b={TEST_IMG_B} />
        </CheckRoot>
    )
}

export default Empty
