import { Button, Input, Stack, Text } from "@chakra-ui/react"
import { type ReactNode, useId } from "react"
import { useSnapshot } from "valtio"
import { Checkbox } from "../../components/ui/checkbox"
import {
    NumberInputField,
    NumberInputLabel,
    NumberInputRoot,
} from "../../components/ui/number-input"
import { Slider } from "../../components/ui/slider"
import type { ScriptControlsController } from "./controller"

export interface GeneratedControlsProps {
    controller: ScriptControlsController
}

/** The host owns the controller lifecycle; rendering never starts analysis or IPC. */
export function GeneratedControls({ controller }: GeneratedControlsProps) {
    const snap = useSnapshot(controller.state)
    return (
        <Stack role="region" aria-label="Script controls" gap={4}>
            {snap.analysisStatus === "pending" && (
                <Text role="status">
                    Waiting for source analysis. Controls retain their last valid values.
                </Text>
            )}
            {snap.analysisError && <Text role="alert">{snap.analysisError}</Text>}
            {snap.controls.map((item) => (
                <ControlField
                    key={item.descriptor.id}
                    id={item.descriptor.id}
                    controller={controller}
                />
            ))}
        </Stack>
    )
}

function ControlField({ controller, id }: GeneratedControlsProps & { id: string }) {
    const snap = useSnapshot(controller.state)
    const domId = useId()
    const item = snap.controls.find((entry) => entry.descriptor.id === id)
    if (!item) return null
    const control = item.descriptor
    const describedBy =
        [item.error ? `${domId}-error` : null, item.notice ? `${domId}-notice` : null]
            .filter(Boolean)
            .join(" ") || undefined
    let field: ReactNode
    if (control.type === "image") {
        field = (
            <Stack gap={1}>
                <Text>
                    {control.label}
                    {control.required ? " (required)" : " (optional)"}
                </Text>
                <Text aria-live="polite">{item.selection?.displayName ?? "No image selected"}</Text>
                <Button
                    aria-label={`Choose image for ${control.label}`}
                    aria-describedby={describedBy}
                    disabled={!controller.canSelectImage || item.selecting}
                    onClick={() => {
                        void controller.selectImage(id)
                    }}
                >
                    {item.selecting ? "Selecting image…" : "Choose image"}
                </Button>
            </Stack>
        )
    } else if (control.type === "boolean" && item.value?.type === "boolean") {
        field = (
            <Checkbox
                checked={item.value.value}
                inputProps={{
                    "aria-describedby": describedBy,
                    "aria-invalid": Boolean(item.error),
                }}
                onCheckedChange={({ checked }) =>
                    controller.setValue(id, { type: "boolean", value: checked === true })
                }
            >
                {control.label}
            </Checkbox>
        )
    } else if (control.type === "text" && item.value?.type === "text") {
        field = (
            <Stack gap={1}>
                <label htmlFor={domId}>{control.label}</label>
                <Input
                    id={domId}
                    value={item.value.value}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(item.error)}
                    onChange={(event) =>
                        controller.setValue(id, { type: "text", value: event.target.value })
                    }
                />
            </Stack>
        )
    } else if (control.type === "slider" && item.value?.type === "number") {
        field = (
            <Slider
                label={control.label}
                aria-label={[control.label]}
                aria-describedby={describedBy}
                min={control.min}
                max={control.max}
                step={control.step}
                value={[item.value.value]}
                showValue
                onValueChange={({ value }) =>
                    controller.setValue(id, { type: "number", value: value[0] })
                }
                onValueChangeEnd={() => controller.commitValue()}
            />
        )
    } else if (control.type === "number" && item.value?.type === "number") {
        field = (
            <NumberInputRoot
                ids={{ input: domId }}
                value={item.draft ?? String(item.value.value)}
                min={control.min}
                max={control.max}
                step={control.step}
                allowOverflow
                clampValueOnBlur={false}
                invalid={Boolean(item.error)}
                onValueChange={({ value }) => controller.editNumber(id, value)}
            >
                <NumberInputLabel>{control.label}</NumberInputLabel>
                <NumberInputField
                    aria-describedby={describedBy}
                    onBlur={() => controller.commitNumber(id)}
                />
            </NumberInputRoot>
        )
    }
    return (
        <Stack gap={1}>
            {field}
            {item.error && (
                <Text id={`${domId}-error`} role="alert">
                    {item.error}
                </Text>
            )}
            {item.notice && (
                <Text id={`${domId}-notice`} role="status">
                    {item.notice}
                </Text>
            )}
            <Button
                alignSelf="start"
                size="xs"
                variant="outline"
                aria-label={`Reset ${control.label}`}
                disabled={!item.touched && !item.selection && !item.error && !item.selecting}
                onClick={() => controller.reset(id)}
            >
                Reset
            </Button>
        </Stack>
    )
}
