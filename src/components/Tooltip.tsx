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
        <VStack gap={0.5} alignItems={"start"}>
            <Text fontWeight={600} color={"fg.2"} fontSize={"sm"}>
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
                paddingY: 1,
                paddingX: 2,
                lineHeight: "1.25rem",
                whiteSpace: "pre-line",
                // boxShadow: "pane2",
                border: "1px solid #77777777",
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
