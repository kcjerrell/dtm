import type { ComponentProps, ComponentType, PropsWithChildren, SVGProps } from "react"
import { IconButton } from "@/components"
import type { IconType } from "@/components/icons/icons"
import Tooltip from "@/components/Tooltip"

type ToolbarButtonProps = ComponentProps<typeof IconButton> & {
    icon?: IconType | ComponentType<SVGProps<SVGSVGElement>>
    tip?: string
}

function ToolbarButton(props: PropsWithChildren<ToolbarButtonProps>) {
    const { icon: Icon, children, onClick, tip, ...restProps } = props

    const content = Icon ? <Icon /> : children

    return (
        <Tooltip tip={tip}>
            <IconButton
                color={"fg.3"}
                _disabled={{
                    cursor: "default",
                }}
                onClick={onClick}
                {...restProps}
            >
                {content}
            </IconButton>
        </Tooltip>
    )
}

export default ToolbarButton
