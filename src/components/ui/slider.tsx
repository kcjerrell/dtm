import { Slider as ChakraSlider, For, HStack, Text } from "@chakra-ui/react"
import * as React from "react"

export interface SliderProps extends ChakraSlider.RootProps {
    marks?: Array<number | { value: number; label: React.ReactNode }>
    label?: React.ReactNode
    showValue?: boolean
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(function Slider(props, ref) {
    const { marks: marksProp, label, showValue, ...rest } = props
    const value = props.defaultValue ?? props.value

    const marks = marksProp?.map((mark) => {
        if (typeof mark === "number") return { value: mark, label: undefined }
        return mark
    })

    const hasMarkLabel = !!marks?.some((mark) => mark.label)

    return (
        <ChakraSlider.Root ref={ref} thumbAlignment="center" {...rest}>
            {label && !showValue && <ChakraSlider.Label>{label}</ChakraSlider.Label>}
            {label && showValue && (
                <HStack justify="space-between">
                    <ChakraSlider.Label>{label}</ChakraSlider.Label>
                    <ChakraSlider.ValueText />
                </HStack>
            )}
            <ChakraSlider.Control data-has-mark-label={hasMarkLabel || undefined}>
                <ChakraSlider.Track bgColor={"bg.3"} height={1}>
                    <ChakraSlider.Range bgColor={"highlight"} />
                </ChakraSlider.Track>
                <SliderThumbs value={value} />
                <SliderMarks marks={marks} />
            </ChakraSlider.Control>
        </ChakraSlider.Root>
    )
})

export interface TriangleSliderProps extends ChakraSlider.RootProps {
    minLabel?: React.ReactNode
    maxLabel?: React.ReactNode
}

export const TriangleSlider = React.forwardRef<HTMLDivElement, TriangleSliderProps>(
    function TriangleSlider(props, ref) {
        const { minLabel, maxLabel, ...rest } = props
        const value = props.defaultValue ?? props.value

        return (
            <ChakraSlider.Root ref={ref} thumbAlignment="center" {...rest}>
                <HStack gap={2} width="full">
                    {minLabel && (
                        <Text as="span" color="fg.2" fontSize="xs" lineHeight="shorter">
                            {minLabel}
                        </Text>
                    )}
                    <ChakraSlider.Control flex={1} minHeight={7}>
                        <ChakraSlider.Track
                            bgColor="bg.3"
                            borderRadius={0}
                            clipPath="polygon(0 100%, 100% 0, 100% 100%)"
                            height={4}
                        >
                            <ChakraSlider.Range bgColor="highlight" />
                        </ChakraSlider.Track>
                        <TriangleSliderThumbs value={value} />
                    </ChakraSlider.Control>
                    {maxLabel && (
                        <Text as="span" color="fg.2" fontSize="xs" lineHeight="shorter">
                            {maxLabel}
                        </Text>
                    )}
                </HStack>
            </ChakraSlider.Root>
        )
    },
)

function SliderThumbs(props: { value?: number[] }) {
    const { value } = props
    return (
        <For each={value}>
            {(_, index) => (
                <ChakraSlider.Thumb
                    width={4.5}
                    height={4.5}
                    bgImage={"linear-gradient(to bottom, {colors.fg.3}, {colors.fg.1})"}
                    borderColor={"fg.2"}
                    key={index}
                    index={index}
                >
                    <ChakraSlider.HiddenInput />
                </ChakraSlider.Thumb>
            )}
        </For>
    )
}

function TriangleSliderThumbs(props: { value?: number[] }) {
    const { value } = props
    return (
        <For each={value}>
            {(_, index) => (
                <ChakraSlider.Thumb
                    width={1}
                    height={7}
                    bgColor="fg.3"
                    borderColor="fg.3"
                    borderRadius="full"
                    key={index}
                    index={index}
                >
                    <ChakraSlider.HiddenInput />
                </ChakraSlider.Thumb>
            )}
        </For>
    )
}

interface SliderMarksProps {
    marks?: Array<number | { value: number; label: React.ReactNode }>
}

const SliderMarks = React.forwardRef<HTMLDivElement, SliderMarksProps>(
    function SliderMarks(props, ref) {
        const { marks } = props
        if (!marks?.length) return null

        return (
            <ChakraSlider.MarkerGroup ref={ref}>
                {marks.map((mark, index) => {
                    const value = typeof mark === "number" ? mark : mark.value
                    const label = typeof mark === "number" ? undefined : mark.label
                    return (
                        <ChakraSlider.Marker key={index} value={value}>
                            <ChakraSlider.MarkerIndicator />
                            {label}
                        </ChakraSlider.Marker>
                    )
                })}
            </ChakraSlider.MarkerGroup>
        )
    },
)
