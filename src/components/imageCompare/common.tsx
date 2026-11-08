import { ButtonGroup, chakra } from "@chakra-ui/react"
import { MotionBox } from "../common"

const ToolbarSectionBase = chakra(
    ButtonGroup,
    {
        base: {
            bgColor: "bg.3",
            borderRadius: "none",
            display: "grid",
            gridTemplateRows: "auto",
            gridAutoFlow: "column",
            position: "relative",
            isolation: "isolate",
            paddingX: 0,
            paddingY: 0,
            gap: 0,
            overflow: "visible",
        },
    },
    {
        defaultProps: {
            size: "xs",
        },
    },
)

interface ToolbarSectionProps extends ChakraProps {
    activeIndex?: number
}

export function ToolbarSection(props: ToolbarSectionProps) {
    const { activeIndex, children, css, ...rest } = props
    const activeColumn = activeIndex === undefined ? undefined : activeIndex + 1
    const placement =
        activeColumn === undefined
            ? undefined
            : { [`& > :nth-child(${activeColumn})`]: { gridColumn: activeColumn } }

    return (
        <ToolbarSectionBase {...rest} css={placement ? [css, placement] : css}>
            {children}
            {activeColumn !== undefined && (
                <MotionBox
                    layout="position"
                    transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
                    aria-hidden="true"
                    pointerEvents="none"
                    position="absolute"
                    gridRow="1 / 2"
                    gridColumn={`${activeColumn} / span 1`}
                    border="0px solid {colors.highlight.1}"
                    borderTopWidth="2px"
                    borderBottomWidth="2px"
                    inset="0px"
                    backgroundColor="grayc.12/50"
                    zIndex={-1}
                />
            )}
        </ToolbarSectionBase>
    )
}

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
