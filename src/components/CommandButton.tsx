import { Box, Spacer } from "@chakra-ui/react"
import type { ComponentProps } from "react"
import type { ICommand } from "@/types"
import IconButton from "./IconButton"

export class CancelExecute extends Error {}

interface CommandButtonComponentProps<T, C = undefined> extends ComponentProps<typeof IconButton> {
    command: ICommand<T, C>
    context?: C
    selectedItems?: T[]
    /**
     * This callback is called immediately after the button is clicked
     * with a shallow copy of the context - which it must return
     * To cancel execution, throw CancelExecute
     * */
    beforeExecute?: (context: C) => C | Promise<C>
    afterExecute?: (error?: unknown) => void
    wrapper?: (
        execute: (selected: T[], context?: C | undefined) => void | Promise<void>,
        selected: T[],
        context: C,
    ) => void | Promise<void>
}

function CommandButton<T, C = undefined>(props: CommandButtonComponentProps<T, C>) {
    const {
        command,
        context,
        selectedItems = [],
        beforeExecute = (ctx) => ctx,
        afterExecute = (err) => {
            if (err) console.error(err)
        },
        wrapper = (execute, selected, ctx) => execute(selected, ctx),
        disabled: disabledProp,
        ...restProps
    } = props
    const areItemsSelected = selectedItems.length > 0

    if (command.menuOnly) return null
    if (command.spacer) return <Spacer key={command.id} />
    if (command.separator)
        return (
            <Box
                key={command.id}
                bgColor={"fg.2/50"}
                height={"1rem"}
                marginX={"0.5rem"}
                width={"1px"}
                css={{
                    "&:first-child": { display: "none" },
                    "&:last-child": { display: "none" },
                }}
            />
        )

    let enabled = true
    if (command.requiresSelection && !areItemsSelected) enabled = false
    if (command.requiresSingleSelection && selectedItems.length !== 1) enabled = false
    if (command.getEnabled) enabled = command.getEnabled(selectedItems, context)

    if (!enabled && command.toolbarEnableMode === "hide") return null

    if (disabledProp) enabled = false

    const Icon = command.getIcon ? command.getIcon(selectedItems, context) : command.icon
    const tip = command.getTip ? command.getTip(selectedItems, context) : command.tip
    const tipTitle = command.getLabel ? command.getLabel(selectedItems, context) : command.label
    const tipText = command.getTipText
        ? command.getTipText(selectedItems, context)
        : command.tipText

    return (
        <IconButton
            aria-label={tipTitle}
            key={command.id}
            size={"sm"}
            onClick={async () => {
                if (!command.action) return

                let ctx: C
                try {
                    ctx = await beforeExecute({ ...context } as C)
                } catch (e: unknown) {
                    if (e instanceof CancelExecute) return
                    throw e
                }

                let err: unknown
                try {
                    await wrapper(command.action, selectedItems, ctx)
                } catch (e: unknown) {
                    err = e
                }

                await afterExecute(err)
            }}
            disabled={!enabled}
            tip={tip}
            tipTitle={tipTitle}
            tipText={tipText}
            {...restProps}
        >
            {Icon && <Icon />}
        </IconButton>
    )
}

export default CommandButton
