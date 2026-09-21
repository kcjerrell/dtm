import { Box, Grid, HStack, Image } from "@chakra-ui/react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { CheckRoot, Panel } from "@/components"
import { PanelButton, PanelSectionHeader } from "@/components/common"
import { useProxyRef } from "@/hooks/valtioHooks"
import { compareBrightness, compareColor, compareDifference } from "./compareImages"
import { Slider } from "@/components/ui/slider"

const TRAIL_SPRING = {
    stiffness: 140,
    damping: 26,
    mass: 0.6,
    restDelta: 0.0005,
}
const MAX_TRAIL_LENGTH = 0.3
const TRAIL_FEATHER_WIDTH = 0.08
const MIN_VISIBLE_TRAIL_LENGTH = 0.002
const TRANSPARENT_MASK = "linear-gradient(to right, transparent, transparent)"

const TEST_IMG_A =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/38dzby284dv6.png"
const TEST_IMG_B =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/vm0kgvlpyklm.jpg"

type SliderEffect = "brightness" | "color" | "difference" | "none"

type ImageCompareState = {
    mode: "slider" | "alt"
    sliderTrail: SliderEffect
    canvasContents: SliderEffect
    sliderShift: boolean
    altSpeed: number
}

function trailMask(sliderPosition: number, trailingPosition: number) {
    const distance = sliderPosition - trailingPosition
    if (Math.abs(distance) < MIN_VISIBLE_TRAIL_LENGTH) return TRANSPARENT_MASK

    const slider = Math.min(Math.max(sliderPosition, 0), 1)
    const trailing = Math.min(Math.max(trailingPosition, 0), 1)

    if (distance > 0) {
        const trailStart = Math.max(trailing, slider - MAX_TRAIL_LENGTH)
        const featherEnd = Math.min(slider, trailStart + TRAIL_FEATHER_WIDTH)

        return `linear-gradient(to right,
            transparent 0%,
            transparent ${trailStart * 100}%,
            black ${featherEnd * 100}%,
            black ${slider * 100}%,
            transparent ${slider * 100}%,
            transparent 100%)`
    }

    const trailEnd = Math.min(trailing, slider + MAX_TRAIL_LENGTH)
    const featherStart = Math.max(slider, trailEnd - TRAIL_FEATHER_WIDTH)

    return `linear-gradient(to right,
        transparent 0%,
        transparent ${slider * 100}%,
        black ${slider * 100}%,
        black ${featherStart * 100}%,
        transparent ${trailEnd * 100}%,
        transparent 100%)`
}

function Empty() {
    const { state, snap } = useProxyRef<ImageCompareState>(() => ({
        mode: "slider",
        sliderTrail: "none",
        canvasContents: "none",
        sliderShift: false,
        altSpeed: 5,
    }))

    // the actual sliderTrail mode depends on sliderShift
    const [sliderTrail, sliderButtonTone] = getSliderTrailAndTone(snap)

    const imgARef = useRef<HTMLImageElement>(null)
    const imgBRef = useRef<HTMLImageElement>(null)
    const imgALoaded = useRef(false)
    const imgBLoaded = useRef(false)

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dragRef = useRef<HTMLDivElement>(null)

    const sliderMv = useMotionValue(0.5)
    const clipMv = useTransform(sliderMv, (value) => `inset(0 ${(1 - value) * 100}% 0 0)`)
    const trailingMv = useSpring(sliderMv, TRAIL_SPRING)
    const canvasMaskMv = useTransform<number, string>(
        [sliderMv, trailingMv],
        ([slider, trailing]) => trailMask(slider, trailing),
    )

    const onLoad = useCallback((img: "a" | "b") => {
        const imgLoaded = img === "a" ? imgALoaded : imgBLoaded
        const other = img === "a" ? imgBLoaded : imgALoaded
        imgLoaded.current = true
        if (!imgLoaded.current || !other.current) return

        const canvas = canvasRef.current
        const imgA = imgARef.current
        if (!canvas || !imgA) return
        canvas.width = imgA.naturalWidth
        canvas.height = imgA.naturalHeight
    }, [])

    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.sliderShift = true
            }
        }
        const keyup = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.sliderShift = false
            }
        }
        document.addEventListener("keydown", keydown, { passive: true })
        document.addEventListener("keyup", keyup, { passive: true })

        return () => {
            document.removeEventListener("keydown", keydown)
            document.removeEventListener("keyup", keyup)
        }
    }, [state])

    return (
        <CheckRoot width={"full"} height={"full"} padding={8}>
            <Panel width={"full"} height={"full"} justifyContent={"center"} alignItems={"center"}>
                <Grid
                    position={"relative"}
                    justifyContent={"stretch"}
                    alignItems={"stretch"}
                    bgColor={"#FF00FF33"}
                    templateColumns={"max-content 1fr max-content"}
                    templateRows={"1fr min-content"}
                    templateAreas={'"image image image" "mode space opts"'}
                >
                    <Image
                        id={"img-a"}
                        crossOrigin="anonymous"
                        ref={imgARef}
                        objectFit={"contain"}
                        padding={0}
                        gridArea={"image"}
                        zIndex={"0"}
                        src={
                            // "asset://localhost/%2FUsers%2Fkcjer%2FLibrary%2FApplication%20Support%2Fcom.kcjer.dtm%2Fdev_images%2Fhff7xew09q5y.jpg"
                            TEST_IMG_A
                        }
                        alt=""
                        onLoad={() => onLoad("a")}
                    />
                    {snap.mode === "slider" && (
                        <motion.img
                            id={"img-b-slider"}
                            crossOrigin="anonymous"
                            ref={imgBRef}
                            src={
                                // "asset://localhost/%2FUsers%2Fkcjer%2FLibrary%2FApplication%20Support%2Fcom.kcjer.dtm%2Fdev_images%2Fnpmd8bs2m6t0.png"
                                TEST_IMG_B
                            }
                            alt=""
                            style={{
                                objectFit: "contain",
                                gridArea: "image",
                                zIndex: "1",
                                clipPath: snap.mode === "slider" ? clipMv : undefined,
                            }}
                            onLoad={() => onLoad("b")}
                        />
                    )}
                    {snap.mode === "alt" && (
                        <motion.img
                            id={"img-b-alt"}
                            crossOrigin="anonymous"
                            ref={imgBRef}
                            src={
                                // "asset://localhost/%2FUsers%2Fkcjer%2FLibrary%2FApplication%20Support%2Fcom.kcjer.dtm%2Fdev_images%2Fnpmd8bs2m6t0.png"
                                TEST_IMG_B
                            }
                            alt=""
                            style={{
                                objectFit: "contain",
                                gridArea: "image",
                                zIndex: "1",
                                animationDuration: snap.altSpeed
                                    ? `${1 / snap.altSpeed}s`
                                    : undefined,
                                animationDelay: snap.altSpeed ? `${2 / snap.altSpeed}s` : undefined,
                            }}
                            className={snap.mode === "alt" ? "blink-anim" : undefined}
                            onLoad={() => onLoad("b")}
                        />
                    )}
                    {/*<img
                        src={
                            "asset://localhost/%2FUsers%2Fkcjer%2FLibrary%2FApplication%20Support%2Fcom.kcjer.dtm%2Fdev_images%2Facvn7qzd9pth.png"
                        }
                        alt={""}
                    />*/}
                    <motion.canvas
                        ref={canvasRef}
                        style={{
                            display: sliderTrail === "none" ? "none" : "block",
                            objectFit: "contain",
                            gridArea: "image",
                            zIndex: "2",
                            pointerEvents: "none",
                            maskImage: canvasMaskMv,
                            WebkitMaskImage: canvasMaskMv,
                            maskRepeat: "no-repeat",
                            WebkitMaskRepeat: "no-repeat",
                        }}
                    />
                    <Box asChild _hover={{ "& > *": { bgColor: "grays.12" } }} cursor={"ew-resize"}>
                        <motion.div
                            ref={dragRef}
                            drag={"x"}
                            dragMomentum={false}
                            dragConstraints={imgARef}
                            dragElastic={0}
                            style={{
                                display: snap.mode === "slider" ? "block" : "none",
                                width: "16px",
                                height: "100%",
                                left: "calc(50% - 8px)",
                                top: 0,
                                position: "absolute",
                                gridArea: "image",
                                // cursor: "ew-resize",
                                zIndex: "3",
                            }}
                            onDrag={(e, info) => {
                                const elem = dragRef.current
                                const img = imgARef.current
                                if (!elem || !img) return
                                const dragBox = elem.getBoundingClientRect()
                                const imgBox = img.getBoundingClientRect()
                                sliderMv.set((dragBox.x - imgBox.x + 8) / imgBox.width)
                            }}
                        >
                            <Box
                                backgroundColor={"grays.8"}
                                style={{
                                    width: "1px",
                                    height: "100%",
                                    margin: "auto",
                                    borderLeft: "2px solid black",
                                    borderRight: "2px solid black",
                                    boxSizing: "content-box",
                                    pointerEvents: "none",
                                }}
                            />
                        </motion.div>
                    </Box>

                    <HStack gridArea={"mode"} py={2}>
                        <PanelButton
                            tone={snap.mode === "slider" ? "selected" : "none"}
                            onClick={() => {
                                state.mode = "slider"
                            }}
                        >
                            Slider
                        </PanelButton>
                        <PanelButton
                            tone={snap.mode === "alt" ? "selected" : "none"}
                            onClick={() => {
                                state.mode = "alt"
                            }}
                        >
                            Alternate
                        </PanelButton>
                    </HStack>
                    {snap.mode === "slider" && (
                        <HStack gridArea={"opts"}>
                            <PanelSectionHeader>Effect</PanelSectionHeader>
                            <PanelButton
                                tone={sliderTrail === "none" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    state.sliderTrail = "none"
                                    if (!canvasRef.current) return
                                    const ctx = canvasRef.current.getContext("2d")
                                    ctx?.clearRect(
                                        0,
                                        0,
                                        canvasRef.current.width,
                                        canvasRef.current.height,
                                    )
                                }}
                            >
                                None
                            </PanelButton>
                            <PanelButton
                                tone={sliderTrail === "brightness" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    state.sliderTrail = "brightness"
                                    if (!canvasRef.current || !imgARef.current || !imgBRef.current)
                                        return
                                    try {
                                        compareBrightness(
                                            imgARef.current,
                                            imgBRef.current,
                                            canvasRef.current,
                                            { gain: 20, threshold: 0.01 },
                                        )
                                    } catch (e) {
                                        console.error(e)
                                    }
                                }}
                            >
                                Brightness
                            </PanelButton>
                            <PanelButton
                                tone={sliderTrail === "color" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    state.sliderTrail = "color"
                                    if (!canvasRef.current || !imgARef.current || !imgBRef.current)
                                        return
                                    try {
                                        compareColor(
                                            imgARef.current,
                                            imgBRef.current,
                                            canvasRef.current,
                                            { gain: 20, threshold: 0.01 },
                                        )
                                    } catch (e) {
                                        console.error(e)
                                    }
                                }}
                            >
                                Color
                            </PanelButton>
                            <PanelButton
                                tone={sliderTrail === "difference" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    state.sliderTrail = "difference"
                                    if (!canvasRef.current || !imgARef.current || !imgBRef.current)
                                        return
                                    try {
                                        compareDifference(
                                            imgARef.current,
                                            imgBRef.current,
                                            canvasRef.current,
                                            { gain: 20, threshold: 0.01 },
                                        )
                                    } catch (e) {
                                        console.error(e)
                                    }
                                }}
                            >
                                Difference
                            </PanelButton>
                        </HStack>
                    )}
                    {snap.mode === "alt" && (
                        <HStack gridArea={"opts"}>
                            <Slider
                                minWidth={"10rem"}
                                min={0}
                                max={10}
                                value={[snap.altSpeed]}
                                onValueChange={(value) => {
                                    state.altSpeed = value.value[0]
                                }}
                            />
                        </HStack>
                    )}
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

function getSliderTrailAndTone(snap: ImageCompareState): [SliderEffect, "info" | "selected"] {
    const tone = snap.sliderShift ? "info" : "selected"
    if (snap.sliderShift) {
        if (snap.sliderTrail === "none") return [snap.canvasContents, tone]
        return ["none", tone]
    }
    return [snap.sliderTrail, tone]
}

export default Empty
