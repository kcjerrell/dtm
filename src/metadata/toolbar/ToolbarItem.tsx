import { useSnapshot } from "valtio"
import { MotionBox } from "@/components/common"
import { getMetadataStore } from "../state/store"
import type { ToolbarCommand } from "./commands"
import ToolbarButton from "./ToolbarButton"

const separatorProps: ChakraProps["_before"] = {
	content: '""',
	width: "1px",
	height: "1rem",
	bgColor: "fg.2/20",
	alignSelf: "center",
	marginInline: "-1px",
}

interface ToolbarItemProps {
	command: ToolbarCommand<ReturnType<typeof getMetadataStore>>
	showSeparator?: boolean
	state: "hide" | "show"
}

export function ToolbarItem(props: ToolbarItemProps) {
	const { command, showSeparator, state } = props
	const snap = useSnapshot(getMetadataStore()) as ReadonlyState<ReturnType<typeof getMetadataStore>>

	const tip = command.tip ?? command.getTip?.(snap)
	const Icon = command.icon
	const content = Icon ? <Icon /> : command.getIcon?.(snap)

	// const hDelay = 0.5 * (order ?? 0)
	// const vDelay = 0.5 * (changedCount ?? 0)

	return (
		<MotionBox
			variants={{
				hide: {
					display: "none",
					opacity: 0,
					scale: 0.5,
					width: "0",
					transition: {
						duration: 0.2,
						delay: 0,
						display: { duration: 0, delay: 0.4 },
						width: { duration: 0.1, delay: 0 },
					},
				},
				show: {
					display: "flex",
					opacity: 1,
					scale: 1,
					width: "auto",
					transition: {
						duration: 0.1,
						delay: 0.2,
						display: { duration: 0, delay: 0 },
						width: { duration: 0.1, delay: 0 },
					},
				},
			}}
			// layoutId={command.id}
			// layoutId={`tbcommand-${order}`}
			_before={showSeparator ? separatorProps : undefined}
			initial={"hide"}
			animate={state}
			// exit={"hide"}
			// layout={"preserve-aspect"}
		>
			<ToolbarButton key={command.id} tip={tip} onClick={() => command.action(getMetadataStore())}>
				{content}
			</ToolbarButton>
		</MotionBox>
	)
}

export default ToolbarItem
