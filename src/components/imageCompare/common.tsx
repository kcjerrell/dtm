import { ButtonGroup, chakra } from "@chakra-ui/react"

export const ToolbarSection = chakra(
    ButtonGroup,
    {
        base: {
            display: "flex",
            flexDirection: "row",
            paddingX: 0,
            paddingY: 0,
            gap: 1,
            overflow: "visible",
        },
    },
    {
        defaultProps: {
            size: "xs",
        },
    },
)

export const ToolbarSeparator = chakra("div", {
    base: {
        bgColor: "fg.2",
        opacity: 0.5,
        width: "1px",
        height: "50%",
        boxShadow: "lg",
        marginInline: 0,
    },
})
