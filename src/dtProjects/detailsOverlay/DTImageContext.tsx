import { createContext, type PropsWithChildren, useContext } from "react"
import type { Snapshot } from "valtio"
import type { DTImageFull, Model } from "@/commands"
import { useDTP } from "../state/context"

const DTImageContext = createContext<
	MaybeReadonly<{
		image?: DTImageFull
		model?: Model
	}>
>({
	image: undefined,
	model: undefined,
})

type DTImageProviderProps = PropsWithChildren<{
	image?: Snapshot<DTImageFull>
}>

export function DTImageProvider(props: DTImageProviderProps) {
	const { children, image } = props
	const { models } = useDTP()
	const model = models.getModel("Model", image?.config?.model)

	return <DTImageContext value={{ image, model }}>{children}</DTImageContext>
}

export function useDTImage() {
	return useContext(DTImageContext)
}
