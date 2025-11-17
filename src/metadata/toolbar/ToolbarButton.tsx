import { type ButtonProps, chakra, IconButton } from "@chakra-ui/react"
import type { ComponentType, JSX, PropsWithChildren, SVGProps } from "react"
import type { IconType } from "react-icons/lib"
import Tooltip from "@/components/Tooltip"

type ToolbarButtonProps = ButtonProps & {
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
				_hover={{
					bg: "unset",
					scale: 1.35,
					color: "fg.1",
				}}
				_disabled={{
					cursor: "default",
				}}
				scale={1.2}
				size={"sm"}
				variant={"ghost"}
				onClick={onClick}
				{...restProps}
			>
				{content}
			</IconButton>
		</Tooltip>
	)
}

export default ToolbarButton
