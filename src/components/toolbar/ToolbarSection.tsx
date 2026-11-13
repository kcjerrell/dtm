import { ButtonGroup, chakra } from "@chakra-ui/react"
import { buildStateContext } from "@/hooks/buildStateContext"
import { LayoutGroup } from "motion/react"

let toolbarSectionId = 0
const getToolbarSectionId = () => `toolbarSectionActiveItem${toolbarSectionId++}`

export const ToolbarSectionContext = buildStateContext(
    (props?: Pick<ToolbarSectionProps<unknown>, "activeItemId" | "mode">) => {
        return {
            get activeItemId() {
                return props?.activeItemId
            },
            activeItemLayoutId: getToolbarSectionId(),
            mode: props?.mode ?? "normal",
        }
    },
    { nullDefault: true },
)

const ToolbarSectionBase = chakra(
    ButtonGroup,
    {
        base: {
            bgColor: "grayc.14",
            border: "1px solid {colors.grayc.10/50}",
            borderRadius: "none",
            borderBottomRadius: "none",
            borderBottom: "none",
            // display: "grid",
            // gridTemplateRows: "auto",
            // gridAutoFlow: "column",
            position: "relative",
            display: "flex",

            isolation: "isolate",
            paddingX: 0,
            paddingY: 0,
            gap: 0,
            overflow: "visible",

            _dark: {
                bgColor: "grayc.16",
                border: "1px solid {colors.grayc.12/50}",
            },
        },
    },
    {
        defaultProps: {
            size: "xs",
        },
    },
)

interface ToolbarSectionProps<K = string> extends ChakraProps {
    mode?: "normal" | "select"
    activeItemId?: K
    onSelectItem?: (itemId: K | null) => Promise<void> | void
}

export function ToolbarSection<K = string>(props: ToolbarSectionProps<K>) {
    const { children, mode, onSelectItem, ...restProps } = props

    const [Provider] = ToolbarSectionContext.useCreateState(props)

    //     useEffect(() => {
    //         const unsub = subscribeKey(state, "activeItemId", (value) => {
    //             console.log("hello")
    //             if (state.mode === "select" && onSelectItem) {
    //                 onSelectItem(value)
    //             }
    //         })
    //
    //         return unsub
    //     }, [state, onSelectItem])

    // const activeColumn = activeIndex === undefined ? undefined : activeIndex + 1
    // const placement =
    //     activeColumn === undefined
    //         ? undefined
    //         : { [`& > :nth-child(${activeColumn})`]: { gridColumn: activeColumn } }

    return (
        <Provider>
            <ToolbarSectionBase {...restProps}>
                <LayoutGroup>{children}</LayoutGroup>
                {/*{activeColumn !== undefined && (
                    <MotionBox
                        layout="position"
                        transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
                        aria-hidden="true"
                        pointerEvents="none"
                        position="absolute"
                        gridRow="1 / 2"
                        gridColumn={`${activeColumn} / span 1`}
                        border="0px solid {colors.highlight.1}"
                        borderTopWidth="3px"
                        // borderBottomWidth="2px"
                        inset="0px"
                        backgroundColor="grayc.12/50"
                        zIndex={-1}
                        // marginY={"-3px"}
                    />
                )}*/}
            </ToolbarSectionBase>
        </Provider>
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
