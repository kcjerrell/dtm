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
        bgColor: "gray",
        width: "1px",
        height: "50%",
        boxShadow: "lg",
        marginInline: 1,
    },
})
