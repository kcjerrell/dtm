import { useSnapshot } from "valtio"
import { MotionBox } from "@/components/common"
import { ToolbarCommand } from '@/metadata/toolbar/commands'
import ToolbarButton from '@/metadata/toolbar/ToolbarButton'

const separatorProps: ChakraProps["_before"] = {
	content: '""',
	width: "1px",
	height: "1rem",
	bgColor: "fg.2/20",
	alignSelf: "center",
	marginInline: "-1px",
}

interface ToolbarItemProps<T, T2Arg> {
	command: ToolbarCommand<T, T2Arg>
	showSeparator?: boolean
	state: T
	arg: T2Arg
}

export function ToolbarItem<T, T2Arg>(props: ToolbarItemProps<T, T2Arg>) {
	const { command, showSeparator, state, arg } = props
	const snap = useSnapshot(state as object) as ReadonlyState<T>

	const tip = command.tip ?? command.getTip?.(snap)
	const Icon = command.icon
	const content = Icon ? <Icon /> : command.getIcon?.(snap)

	const commandState = command.check?.(snap, arg) ?? true

	// const hDelay = 0.5 * (order ?? 0)
	// const vDelay = 0.5 * (changedCount ?? 0)

	return (
		<MotionBox
			variants={{
				hide: {
					// display: "none",
					opacity: 0.5,
					scale: 0.9,
					// width: "0",
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
						delay: 0,
						display: { duration: 0, delay: 0 },
						width: { duration: 0.1, delay: 0 },
					},
				},
			}}
			// layoutId={command.id}
			// layoutId={`tbcommand-${order}`}
			_before={showSeparator ? separatorProps : undefined}
			initial={"hide"}
			animate={commandState ? "show" : "hide"}
			// exit={"hide"}
			// layout={"preserve-aspect"}
		>
			<ToolbarButton key={command.id} tip={tip} onClick={() => command.action(state)} disabled={!commandState}>
				{content}
			</ToolbarButton>
		</MotionBox>
	)
}

export default ToolbarItem
