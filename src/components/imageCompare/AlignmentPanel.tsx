import { Box, CloseButton, FloatingPanel, NumberInput, Portal, Text } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import IconButton from "../IconButton"
import { NumberInputField, NumberInputLabel, NumberInputRoot } from "../ui/number-input"
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
            size="sm"
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
    const disabled = !snap.imageASrc || !snap.imageBSrc || !snap.imageAWidth || !snap.imageBWidth

    return (
        <FloatingPanel.Root
            open={open && snap.mode === "align"}
            onOpenChange={({ open }) => setOpen(open)}
            defaultSize={{ width: 300, height: 330 }}
            minSize={{ width: 260, height: 300 }}
            defaultPosition={{ x: 24, y: 80 }}
            allowOverflow={false}
            persistRect
            restoreFocus={snap.mode === "align"}
        >
            <FloatingPanel.Trigger asChild>
                <IconButton aria-label="Adjust alignment" px={2} aspectRatio="auto">
                    Values
                </IconButton>
            </FloatingPanel.Trigger>
            <Portal>
                <FloatingPanel.Positioner>
                    <FloatingPanel.Content
                        data-image-compare-controls=""
                        bgColor="bg.1"
                        color="fg.1"
                        borderWidth="1px"
                        borderColor="grays.7"
                        boxShadow="lg"
                    >
                        <FloatingPanel.Header bgColor="bg.2" p={3}>
                            <FloatingPanel.DragTrigger>
                                <FloatingPanel.Title fontSize="sm">
                                    Image B alignment
                                </FloatingPanel.Title>
                            </FloatingPanel.DragTrigger>
                            <FloatingPanel.Control>
                                <FloatingPanel.CloseTrigger asChild>
                                    <CloseButton size="xs" aria-label="Close alignment controls" />
                                </FloatingPanel.CloseTrigger>
                            </FloatingPanel.Control>
                        </FloatingPanel.Header>
                        <FloatingPanel.Body
                            display="flex"
                            flexDirection="column"
                            gap={3}
                            p={4}
                            overflow="auto"
                        >
                            <AlignmentField
                                label="X offset"
                                value={snap.imageBOffset.x}
                                step={1}
                                disabled={disabled}
                                onChange={(value) => {
                                    state.imageBOffset.x = value
                                }}
                            />
                            <AlignmentField
                                label="Y offset"
                                value={snap.imageBOffset.y}
                                step={1}
                                disabled={disabled}
                                onChange={(value) => {
                                    state.imageBOffset.y = value
                                }}
                            />
                            <AlignmentField
                                label="Scale (%)"
                                value={snap.imageBScale * 100}
                                step={0.1}
                                min={0.01}
                                disabled={disabled}
                                onChange={(value) => {
                                    state.imageBScale = value / 100
                                }}
                            />
                            <Text fontSize="xs" color="fg.2">
                                Offsets use image A pixels. 100% is the default fitted size.
                            </Text>
                        </FloatingPanel.Body>
                        <FloatingPanel.ResizeTriggers axes={["e", "s", "se"]} />
                    </FloatingPanel.Content>
                </FloatingPanel.Positioner>
            </Portal>
        </FloatingPanel.Root>
    )
}
