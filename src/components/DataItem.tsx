import { chakra, HStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ComponentProps, useLayoutEffect, useRef, useState } from "react"
import { useDTImage } from "@/dtProjects/detailsOverlay/DTImageContext"
import { prepData } from "@/metadata/infoPanel/DataItem"
import type { DrawThingsConfigGrouped } from "@/types"
import { getSampler, getSeedMode } from "@/utils/config"

interface DataItemProps extends ComponentProps<typeof Root> {
    label?: string
    maxLines?: number
    data?: unknown
}

function DataItem(props: DataItemProps) {
    const { data, label, maxLines, ...rest } = props

    const [collapsible, setCollapsible] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [maxHeight, setMaxHeight] = useState("unset")

    const hasMeasured = useRef(false)
    const hasRendered = useRef(false)

    if (hasMeasured.current && !hasRendered.current) {
        hasRendered.current = true
    }

    const contentRef = useRef<HTMLDivElement>(null)

    const [display, _isObject, dataType] = prepData(data)

    useLayoutEffect(() => {
        hasMeasured.current = true
        if (!contentRef.current || !maxLines) return
        const style = getComputedStyle(contentRef.current)
        let lineHeight = parseFloat(style.lineHeight)
        if (Number.isNaN(lineHeight)) {
            // fallback: compute from font size if "normal"
            const fontSize = parseFloat(style.fontSize)
            lineHeight = fontSize * 1.2 // approximate
        }

        const height = contentRef.current.clientHeight
        if (height > lineHeight * maxLines) {
            setCollapsible(true)
            setCollapsed(true)
            setMaxHeight(`${lineHeight * maxLines}px`)
        }
    }, [maxLines])

    if (data === undefined || data === null) {
        return null
    }

    return (
        <Root {...rest}>
            <HStack>{label && <Label>{label}</Label>}</HStack>
            <Content
                key={`${collapsible}`}
                type={dataType}
                ref={contentRef}
                collapse={getVariant(collapsible, collapsed)}
            >
                <motion.div
                    // layout
                    initial={{
                        height: maxHeight,
                    }}
                    animate={{
                        height: hasMeasured.current ? (collapsed ? maxHeight : "auto") : maxHeight,
                    }}
                    transition={{ duration: hasRendered.current ? 0.25 : 0 }}
                >
                    {display}
                </motion.div>
            </Content>
            {collapsible && (
                <ExpandButton onClick={() => setCollapsed(!collapsed)}>
                    {collapsed ? "Expand" : "Collapse"}
                </ExpandButton>
            )}
        </Root>
    )
}

function getVariant(collapsible: boolean, collapsed: boolean) {
    if (!collapsible) return "normal"
    if (collapsed) return "collapsed"
    return "expanded"
}

const Root = chakra(
    motion.div,
    {
        base: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
        },
        variants: {
            size: {
                sm: {
                    fontSize: "sm",
                    "& .dataitem_content": {
                        fontSize: "sm",
                    },
                    "& .dataitem_label": {
                        fontSize: "xs",
                    },
                    "& .dataitem_expandbutton": {
                        fontSize: "xs",
                    },
                },
                md: {
                    fontSize: "md",
                    "& .dataitem_content": {
                        fontSize: "md",
                    },
                    "& .dataitem_label": {
                        fontSize: "sm",
                    },
                    "& .dataitem_expandbutton": {
                        fontSize: "sm",
                    },
                },
            },
        },
    },
    // { defaultProps: { layout: "position" } },
)

const Label = chakra(
    motion.div,
    {
        base: {
            paddingLeft: 0.5,
            fontWeight: 500,
            fontSize: "xs",
            color: "fg.1",
            overflow: "clip",
            textOverflow: "ellipsis",
        },
    },
    {
        defaultProps: {
            //  layout: true,
            className: "dataitem_label",
        },
    },
)

const ExpandButton = chakra(
    motion.div,
    {
        base: {
            fontSize: "xs",
            color: "fg.2",
            position: "absolute",
            bottom: 0,
            right: 0,
            pl: "2.5rem",
            pt: "1rem",
            fontWeight: 600,
            bgImage:
                "radial-gradient(farthest-side at bottom right, var(--chakra-colors-bg-1) 50%, #00000000 100%)",
            _hover: {
                color: "fg.1",
            },
            _peerHover: {
                bgImage:
                    "radial-gradient(farthest-side at bottom right, var(--chakra-colors-bg-2) 50%, #00000000 100%)",
            },
        },
    },
    { defaultProps: { layout: true, className: "dataitem_expandbutton" } },
)

const Content = chakra(
    "div",
    {
        base: {
            outline: "1px solid transparent",
            padding: "2px",
            border: "1px solid transparent",
            color: "fg.2",
            overflowX: "clip",
            overflowY: "clip",
            minWidth: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            borderRadius: "sm",
            _dark: {
                _hover: {
                    bgColor: "bg.3",
                },
            },
            fontSize: "sm",
            _hover: {
                // boxShadow: "0px 1px 2px -1px #00000055, 0px 2px 6px -2px #00000022",
                boxShadow: "2px 2px 4px -2px #00000055, -2px 2px 4px -2px #00000055",
                // transform: "translateY(-1px)",
                bgColor: "bg.2",
                transition:
                    "box-shadow 0.1s ease-in-out, transform 0.1s ease-in-out, background-color 0.1s ease-in-out",
            },
            transition:
                "box-shadow 0.3s ease-in-out, transform 0.3s ease-in-out, background-color 0.3s ease-in-out",
            transitionDelay: "0.25s",
            _selection: {
                bgColor: "info/50",
            },
        },
        variants: {
            collapse: {
                collapsed: {
                    marginBottom: 0.5,
                    _after: {
                        content: '""',
                        position: "absolute",
                        top: "calc(100% - 2rem)",
                        backgroundImage:
                            "linear-gradient(0deg, var(--chakra-colors-bg-1) 0%, #00000000 100%)",
                        bottom: "2px",
                        right: 0,
                        left: 0,
                        transition: "all 0.5s ease-in-out",
                    },
                },
                expanded: {
                    _after: {
                        content: '""',
                        position: "absolute",
                        top: "calc(100% - 2px)",
                        backgroundImage:
                            "linear-gradient(0deg, var(--chakra-colors-bg-1) 0%, #00000000 100%)",
                        bottom: "2px",
                        right: 0,
                        left: 0,
                        transition: "all 0.5s ease-in-out",
                    },
                    // height: "auto",
                    // maxHeight: "unset !important",
                    paddingBottom: "1rem",
                },
                normal: {},
            },
            type: {
                object: {
                    textIndent: "hanging each-line 2.5	rem",
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                },
                string: {},
                number: {},
                boolean: {},
                array: {},
                null: {},
                undefined: {},
            },
        },
    },
    { defaultProps: { className: "dataitem_content" } },
)

interface DataItemTemplateProps<T extends keyof DrawThingsConfigGrouped> extends DataItemProps {
    value?: MaybeReadonly<DrawThingsConfigGrouped[T]>
}

export function DataItemTemplate<T extends keyof DrawThingsConfigGrouped>(
    props: DataItemTemplateProps<T> & { property: T },
) {
    const { value, property, ...rest } = props
    if (value === undefined || value === null || !property || !templatesReverse[property])
        return null
    const Template = templatesReverse[property] as
        | ((props: DataItemTemplateProps<T>) => React.ReactNode)
        | undefined
    if (!Template) return null
    return <Template value={value} {...rest} />
}

const templates = {
    Size: (props: DataItemTemplateProps<"size">) => {
        const { value, ...rest } = props
        const { image } = useDTImage()
        const upscaler = image?.groupedConfig?.upscaler

        const scale = upscaler?.value && upscaler?.scaleFactor ? `(x${upscaler.scaleFactor})` : ""

        if (!value?.width || !value?.height) return null
        return (
            <DataItem label={"Size"} data={`${value.width} x ${value.height} ${scale}`} {...rest} />
        )
    },
    OriginalSize: (props: DataItemTemplateProps<"originalSize">) => {
        const { value, ...rest } = props
        const { model } = useDTImage()

        if (model?.version && !model.version?.startsWith("sdxl")) return null
        if (!value?.width || !value?.height) return null

        return (
            <DataItem label={"Original Size"} data={`${value.width} x ${value.height}`} {...rest} />
        )
    },
    TargetImageSize: (props: DataItemTemplateProps<"targetImageSize">) => {
        const { value, ...rest } = props
        const { model } = useDTImage()

        if (model?.version && !model.version?.startsWith("sdxl")) return null
        if (!value?.width || !value?.height) return null

        return (
            <DataItem
                label={"Target Image Size"}
                data={`${value.width} x ${value.height}`}
                {...rest}
            />
        )
    },
    NegativeOriginalSize: (props: DataItemTemplateProps<"negativeOriginalSize">) => {
        const { value, ...rest } = props
        const { model } = useDTImage()

        if (model?.version && !model.version?.startsWith("sdxl")) return null
        if (!value?.width || !value?.height) return null

        return (
            <DataItem
                label={"Negative Original Size"}
                data={`${value.width} x ${value.height}`}
                {...rest}
            />
        )
    },
    Crop: (props: DataItemTemplateProps<"crop">) => {
        const { value, ...rest } = props
        const { model } = useDTImage()

        if (model?.version && !model.version?.startsWith("sdxl")) return null
        if (!value?.left || !value?.top) return null

        return <DataItem label={"Crop"} data={`${value.left}, ${value.top}`} {...rest} />
    },
    NumFrames: (props: DataItemTemplateProps<"numFrames">) => {
        const { value, ...rest } = props
        if (!value) return null
        return <DataItem label={"Num Frames"} data={value} {...rest} />
    },
    Seed: (props: DataItemTemplateProps<"seed">) => {
        const { value, ...rest } = props
        if (value === undefined || value.value === undefined) return null

        return (
            <DataItem
                label={"Seed"}
                data={`${value.value} (${getSeedMode(value.seedMode)})`}
                {...rest}
            />
        )
    },
    Model: (props: DataItemTemplateProps<"model">) => {
        const { value, ...rest } = props
        const { model } = useDTImage()

        if (!value) return null

        let displayValue = value
        if (model?.name && model?.version) displayValue = `${model.name} (${model.version})`
        return <DataItem label={"Model"} data={displayValue} {...rest} />
    },
    Steps: (props: DataItemTemplateProps<"steps">) => {
        const { value, ...rest } = props
        if (!value) return null
        return <DataItem label={"Steps"} data={value} {...rest} />
    },
    Sampler: (props: DataItemTemplateProps<"sampler">) => {
        const { value, ...rest } = props
        if (!value || value.value === undefined) return null
        const samplerName = getSampler(value.value)
        let data = samplerName
        if (samplerName === "TCD" && value.stochasticSamplingGamma !== undefined) {
            data += ` (${(value.stochasticSamplingGamma * 100).toFixed(0)}%)`
        }

        return <DataItem label={"Sampler"} data={data} {...rest} />
    },
    Refiner: (props: DataItemTemplateProps<"refiner">) => {
        const { value, ...rest } = props
        const { refiner } = useDTImage()
        if (!value?.model) return null

        const name = refiner?.name || value.model
        const start = value.start !== undefined ? ` (${(value.start * 100).toFixed(1)}%)` : ""
        return <DataItem label={"Refiner"} data={`${name}${start}`} {...rest} />
    },
    Shift: (props: DataItemTemplateProps<"shift">) => {
        const { value, ...rest } = props
        if (value?.value === undefined) return null
        let data = value.value.toFixed(2)
        if (value.resDependentShift) {
            data += " (Res. Dependent)"
        }
        return <DataItem label={"Shift"} data={data} {...rest} />
    },
    GuidanceEmbed: (props: DataItemTemplateProps<"guidanceEmbed">) => {
        const { value, ...rest } = props
        if (value?.speedUp !== false || value?.value === undefined) return null
        return <DataItem label={"Guidance Embed"} data={value.value} {...rest} />
    },
    CausalInference: (props: DataItemTemplateProps<"causalInference">) => {
        const { value, ...rest } = props
        if (!value || value.value === 0) return null
        return (
            <DataItem
                label={"Causal Inference"}
                data={`True (${value.value}-${value.pad})`}
                {...rest}
            />
        )
    },
    CfgZero: (props: DataItemTemplateProps<"cfgZero">) => {
        const { value, ...rest } = props
        if (!value?.star) return null
        return (
            <DataItem label={"CFG Zero Star"} data={`True (${value.initSteps} steps)`} {...rest} />
        )
    },
    Strength: (props: DataItemTemplateProps<"strength">) => {
        const { value, ...rest } = props
        if (!value) return null
        const percent = value <= 1 ? value * 100 : value
        const displayValue = percent.toFixed(1)

        return <DataItem label={"Strength"} data={`${displayValue}%`} {...rest} />
    },
    GuidanceScale: (props: DataItemTemplateProps<"guidanceScale">) => {
        const { value, ...rest } = props
        if (!value) return null
        return <DataItem label={"Guidance Scale"} data={value.toFixed(1)} {...rest} />
    },
    MaskBlur: (props: DataItemTemplateProps<"maskBlur">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        let data = value.value.toFixed(1)
        if (value.outset) {
            data += ` (${value.outset} outset)`
        }
        return <DataItem label={"Mask Blur"} data={data} {...rest} />
    },
    Sharpness: (props: DataItemTemplateProps<"sharpness">) => {
        const { value, ...rest } = props
        if (!value) return null
        return <DataItem label={"Sharpness"} data={value.toFixed(1)} {...rest} />
    },
    TiledDecoding: (props: DataItemTemplateProps<"tiledDecoding">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return (
            <DataItem
                label={"Tiled Decoding"}
                data={`${value.width} x ${value.height} (${value.overlap} overlap)`}
                {...rest}
            />
        )
    },
    TiledDiffusion: (props: DataItemTemplateProps<"tiledDiffusion">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return (
            <DataItem
                label={"Tiled Diffusion"}
                data={`${value.width} x ${value.height} (${value.overlap} overlap)`}
                {...rest}
            />
        )
    },
    HiresFix: (props: DataItemTemplateProps<"hiresFix">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return (
            <DataItem
                label={"Hires Fix"}
                data={`${value.width} x ${value.height} at ${((value.strength ?? 0) * 100).toFixed(0)}%`}
                {...rest}
            />
        )
    },
    ClipL: (props: DataItemTemplateProps<"separateClipL">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return <DataItem label={"Clip L"} data={value.text} {...rest} />
    },
    OpenClipG: (props: DataItemTemplateProps<"separateOpenClipG">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return <DataItem label={"Open Clip G"} data={value.text} {...rest} />
    },
    T5: (props: DataItemTemplateProps<"separateT5">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return <DataItem label={"T5"} data={value.text} {...rest} />
    },
    TeaCache: (props: DataItemTemplateProps<"teaCache">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        return (
            <DataItem
                label={"Tea Cache"}
                data={{
                    Threshold: value.threshold,
                    Start: value.start,
                    End: value.end,
                    "Max Skip": value.maxSkipSteps,
                }}
                {...rest}
            />
        )
    },
    Upscaler: (props: DataItemTemplateProps<"upscaler">) => {
        const { value, ...rest } = props
        if (!value?.value) return null
        let data = value.value.replace(/\.ckpt$/, "")
        if (value.scaleFactor) {
            data += ` (${value.scaleFactor.toFixed(1)}x)`
        }
        return <DataItem label={"Upscaler"} data={data} {...rest} />
    },
    Batch: (props: DataItemTemplateProps<"batch">) => {
        const { value, ...rest } = props
        if (!value || (value.size === 1 && value.count === 1)) return null
        return <DataItem label={"Batch"} data={`${value.size} x ${value.count}`} {...rest} />
    },
    // todo: find out what model versions these are for
    Stage2: (props: DataItemTemplateProps<"stage2">) => {
        const { value, ...rest } = props
        if (!value || (value.guidance === 0 && value.steps === 0)) return null
        return null
        return (
            <DataItem
                label={"Stage 2"}
                data={`${value.steps} steps at ${value.guidance.toFixed(1)} guidance (${value.shift.toFixed(2)} shift)`}
                {...rest}
            />
        )
    },
    ImagePrior: (props: DataItemTemplateProps<"imagePrior">) => {
        const { value, ...rest } = props
        if (!value || value.steps === 0) return null
        return null
        return (
            <DataItem
                label={"Image Prior"}
                data={`${value.steps} steps${value.negativePrompt ? " (Negative Prompt)" : ""}`}
                {...rest}
            />
        )
    },
    AestheticScore: (props: DataItemTemplateProps<"aestheticScore">) => {
        const { value, ...rest } = props
        if (!value || (value.positive === 0 && value.negative === 0)) return null
        return null
        return (
            <DataItem
                label={"Aesthetic Score"}
                data={`${value.positive} / ${value.negative}`}
                {...rest}
            />
        )
    },
}

const templatesReverse: {
    [K in keyof DrawThingsConfigGrouped]?: (props: DataItemTemplateProps<K>) => React.ReactNode
} = {
    size: templates.Size,
    originalSize: templates.OriginalSize,
    targetImageSize: templates.TargetImageSize,
    negativeOriginalSize: templates.NegativeOriginalSize,
    crop: templates.Crop,
    numFrames: templates.NumFrames,
    seed: templates.Seed,
    model: templates.Model,
    steps: templates.Steps,
    sampler: templates.Sampler,
    refiner: templates.Refiner,
    shift: templates.Shift,
    guidanceEmbed: templates.GuidanceEmbed,
    causalInference: templates.CausalInference,
    cfgZero: templates.CfgZero,
    strength: templates.Strength,
    guidanceScale: templates.GuidanceScale,
    aestheticScore: templates.AestheticScore,
    maskBlur: templates.MaskBlur,
    sharpness: templates.Sharpness,
    tiledDecoding: templates.TiledDecoding,
    tiledDiffusion: templates.TiledDiffusion,
    hiresFix: templates.HiresFix,
    separateClipL: templates.ClipL,
    separateOpenClipG: templates.OpenClipG,
    separateT5: templates.T5,
    teaCache: templates.TeaCache,
    upscaler: templates.Upscaler,
    batch: templates.Batch,
    stage2: templates.Stage2,
    imagePrior: templates.ImagePrior,
}

const ex = DataItem as typeof DataItem & typeof templates
Object.assign(ex, templates)

export default ex
