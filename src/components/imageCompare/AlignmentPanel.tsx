import { Box, NumberInput, Popover, Portal } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { Panel } from "@/components/common"
import { useRootElementRef } from "@/hooks/useRootElement"
import IconButton from "../IconButton"
import { NumberInputField, NumberInputLabel, NumberInputRoot } from "../ui/number-input"
import { AlignmentSettings } from "./icons"
import { ImageCompareContext } from "./state"

const format = (number: number) => String(Number(number.toFixed(4)))

function AlignmentField(props: {
    label: string
    value: number
    step: number
    min?: number
    disabled: boolean
    onChange: (value: number) => void
}) {
    const { label, value, step, min, disabled, onChange } = props
    const [draft, setDraft] = useState(() => format(value))

    useEffect(() => {
        setDraft(format(value))
    }, [value])

    return (
        <NumberInputRoot
            size="xs"
            minWidth={0}
            showScrubber={false}
            display="flex"
            flexDirection="column"
            gap={1}
            value={draft}
            step={step}
            allowMouseWheel
            min={min}
            disabled={disabled}
            clampValueOnBlur={false}
            onValueChange={({ value: text, valueAsNumber }) => {
                setDraft(text)
                if (Number.isFinite(valueAsNumber) && (min === undefined || valueAsNumber >= min)) {
                    onChange(valueAsNumber)
                }
            }}
            onBlur={() => setDraft(format(value))}
        >
            <NumberInputLabel fontSize="xs" color="fg.2">
                {label}
            </NumberInputLabel>
            <Box position="relative">
                <NumberInputField bgColor="bg.2" />
                <NumberInput.Control>
                    <NumberInput.IncrementTrigger />
                    <NumberInput.DecrementTrigger />
                </NumberInput.Control>
            </Box>
        </NumberInputRoot>
    )
}

export default function AlignmentPanel() {
    const [state, snap] = ImageCompareContext.useContext()
    const [open, setOpen] = useState(false)
    const viewRef = useRootElementRef("view")
    const disabled = !snap.imageASrc || !snap.imageBSrc || !snap.imageAWidth || !snap.imageBWidth

    return (
        <Popover.Root
            open={open && snap.mode === "align"}
            onOpenChange={({ open }) => setOpen(open)}
            positioning={{ placement: "top" }}
        >
            <Popover.Trigger asChild>
                <IconButton
                    variant="toolbar"
                    tbActive={open && snap.mode === "align"}
                    aria-label="Adjust alignment"
                    tipTitle="Adjust alignment"
                >
                    <AlignmentSettings />
                </IconButton>
            </Popover.Trigger>
            <Portal container={viewRef}>
                <Popover.Positioner>
                    <Popover.Content asChild aria-label="Image B alignment">
                        <Panel
                            variant="float"
                            bgColor="bg.1"
                            color="fg.1"
                            width="14rem"
                            maxHeight="none"
                            overflow="visible"
                            data-image-compare-controls=""
                        >
                            <Popover.Arrow css={{ "--arrow-background": "{colors.bg.1}" }} />
                            <Popover.Body
                                display="grid"
                                gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                                gap={2}
                                p={0}
                            >
                                <AlignmentField
                                    label="X offset"
                                    value={snap.imageBOffset.x}
                                    step={1}
                                    disabled={disabled}
                                    onChange={(value) => {
                                        state.pinState = null
                                        state.imageBOffset.x = value
                                    }}
                                />
                                <AlignmentField
                                    label="Y offset"
                                    value={snap.imageBOffset.y}
                                    step={1}
                                    disabled={disabled}
                                    onChange={(value) => {
                                        state.pinState = null
                                        state.imageBOffset.y = value
                                    }}
                                />
                                <AlignmentField
                                    label="Scale X (%)"
                                    value={snap.imageBScaleX * 100}
                                    step={0.1}
                                    disabled={disabled}
                                    onChange={(value) => {
                                        state.pinState = null
                                        state.imageBScaleX = value / 100
                                    }}
                                />
                                <AlignmentField
                                    label="Scale Y (%)"
                                    value={snap.imageBScaleY * 100}
                                    step={0.1}
                                    disabled={disabled}
                                    onChange={(value) => {
                                        state.pinState = null
                                        state.imageBScaleY = value / 100
                                    }}
                                />
                            </Popover.Body>
                        </Panel>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover.Root>
    )
}
