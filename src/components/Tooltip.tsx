import { Text, type TooltipContentProps, VStack } from "@chakra-ui/react"
import type { PropsWithChildren } from "react"
import { Tooltip } from "./ui/tooltip"

interface TooltipProps extends TooltipContentProps {
    /** if present, tiptitle and tiptext will be ignored */
    tip?: React.ReactNode
    tipTitle?: string
    tipText?: string
    contentProps?: TooltipContentProps
}

function TooltipComponent(props: PropsWithChildren<TooltipProps>) {
    const { tip, tipTitle, tipText, children, contentProps, ...rest } = props

    const Content = tip ?? (
        <VStack gap={1} alignItems={"start"}>
            <Text fontWeight={600} color={"fg.2"} fontSize={"md"}>
                {tipTitle}
            </Text>
            <Text color={"fg.2"} fontSize={"sm"}>
                {tipText}
            </Text>
        </VStack>
    )

    return (
        <Tooltip
            openDelay={1000}
            closeDelay={undefined}
            content={Content}
            contentProps={{
                fontSize: "sm",
                bgColor: "bg.2",
                color: "fg.2",
                padding: 2,
                lineHeight: "1.25rem",
                whiteSpace: "pre-line",
                width: "80rem",
                ...contentProps,
            }}
            positioning={{ placement: "top" }}
            {...rest}
        >
            {children}
        </Tooltip>
    )
}

export default TooltipComponent
