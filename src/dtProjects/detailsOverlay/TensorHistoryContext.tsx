import { createContext, type PropsWithChildren, useContext } from "react"
import type { Model, TensorHistoryExtra } from "@/commands"
import type { DrawThingsGroupedConfig } from "@/types"
import { useDTP } from "../state/context"

const TensorHistoryContext = createContext<
	MaybeReadonly<{
		history?: TensorHistoryExtra
		groupedConfig?: DrawThingsGroupedConfig
		model?: Model
	}>
>({
	history: undefined,
	groupedConfig: undefined,
})

type TensorHistoryProviderProps = PropsWithChildren<{
	history?: MaybeReadonly<TensorHistoryExtra>
	groupedConfig?: DrawThingsGroupedConfig
}>

export function TensorHistoryProvider(props: TensorHistoryProviderProps) {
	const { children, history, groupedConfig } = props
	const { models } = useDTP()
	const model = models.getModel("Model", groupedConfig?.model)

	return (
		<TensorHistoryContext value={{ history, groupedConfig, model }}>
			{children}
		</TensorHistoryContext>
	)
}

export function useTensorHistory() {
	return useContext(TensorHistoryContext)
}
