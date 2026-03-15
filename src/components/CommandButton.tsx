import { Spacer } from "@chakra-ui/react"
import type { ComponentProps } from "react"
import type { ICommandItem } from "@/types"
import IconButton from "./IconButton"

interface CommandButtonComponentProps<T, C = undefined> extends ComponentProps<typeof IconButton> {
    command: ICommandItem<T, C>
    context?: C
    selectedItems?: T[]
    beforeExecute?: (context: C) => C | Promise<C>
    afterExecute?: (error?: unknown) => void
    wrapper?: (
        execute: (selected: T[], context?: C | undefined) => void | Promise<void>,
        selected: T[],
        context: C
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
        ...restProps
    } = props
    const areItemsSelected = selectedItems.length > 0

    {
        if (command.menuOnly) return null
        if (command.spacer) return <Spacer key={command.id} />

        let enabled = true
        if (command.requiresSelection && !areItemsSelected) enabled = false
        if (command.requiresSingleSelection && selectedItems.length !== 1) enabled = false
        if (command.getEnabled) enabled = command.getEnabled(selectedItems, context)

        const Icon = command.getIcon ? command.getIcon(selectedItems, context) : command.icon
        const tip = command.getTip ? command.getTip(selectedItems, context) : command.tip
        const tipTitle = command.getLabel ? command.getLabel(selectedItems, context) : command.label
        const tipText = command.getTipText
            ? command.getTipText(selectedItems, context)
            : command.tipText

        return (
            <IconButton
                aria-label={command.label}
                key={command.id}
                size={"sm"}
                onClick={async () => {
                    const ctx = await beforeExecute({ ...context } as C)
                    let err: unknown
                    try {
                        await wrapper(command.onClick, selectedItems, ctx)
                    } catch (e: unknown) {
                        err = e
                    }
                    afterExecute(err)
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
}

export default CommandButton
