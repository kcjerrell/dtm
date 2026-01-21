import { HStack } from "@chakra-ui/react"
import { type ComponentProps, createContext, type ReactNode, use, useCallback } from "react"
import { IconButton, Tooltip } from "."

const IconToggleContext = createContext({
    value: {} as Record<string, boolean | undefined>,
    onClick: (_option: string) => {},
})

interface IconToggleProps extends Omit<ChakraProps, "value" | "onChange"> {
    children: ReactNode
    value: Record<string, boolean | undefined>
    onChange: (value: Record<string, boolean | undefined>) => void
    requireOne?: boolean
}

function IconToggle(props: IconToggleProps) {
    const { children, value, requireOne, onChange, ...restProps } = props

    const onClick = useCallback(
        (option: string) => {
            const entries = { ...value }
            const totalOptions = Object.keys(entries).length
            const totalSelected = Object.values(entries).filter((v) => v).length

            if (requireOne) {
                // if clicking the selected option, and can switch if there are two
                if (entries[option] && totalOptions === 2 && totalSelected === 1) {
                    Object.keys(entries).forEach((key) => {
                        entries[key] = !entries[key]
                    })
                }
                // otherwise, select the clicked option and disable the others
                else {
                    Object.keys(entries).forEach((key) => {
                        entries[key] = false
                    })
                    entries[option] = true
                }
            }
            // otherwise just toggle
            else entries[option] = !entries[option]
            onChange(entries)
        },
        [value, onChange, requireOne],
    )

    const cv = { value, onClick }

    return (
        <IconToggleContext value={cv}>
            <HStack
                gap={0}
                border={"0px solid {gray/50}"}
                borderRadius={"md"}
                overflow={"clip"}
                flex={"0 0 auto"}
                justifySelf={"flex-start"}
                {...restProps}
            >
                {children}
            </HStack>
        </IconToggleContext>
    )
}

interface TriggerProps extends ComponentProps<typeof IconButton> {
    option: string
    // initialValue?: boolean
    tip?: ReactNode
    tipText?: string
    tipTitle?: string
}

function Trigger(props: TriggerProps) {
    const { children, option, tip, tipText, tipTitle, ...restProps } = props

    const { value, onClick } = use(IconToggleContext)

    // useEffect(() => {
    //     if (!(option in context.entries)) {
    //         context.entries[option] = initialValue ?? false
    //     }
    //     return () => {
    //         delete context.entries[option]
    //     }
    // }, [option, initialValue, context])

    return (
        <Tooltip tip={tip} tipText={tipText} tipTitle={tipTitle}>
            <IconButton
                variant={"toggle"}
                toggled={value[option] ?? false}
                onClick={() => {
                    onClick(option)
                }}
                {...restProps}
            >
                {children}
            </IconButton>
        </Tooltip>
    )
}

IconToggle.Trigger = Trigger

export default IconToggle
