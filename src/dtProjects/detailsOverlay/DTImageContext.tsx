import { createContext, useContext } from "react"
import type { DTImageFull, Model } from "@/commands"

export const DTImageContext = createContext<
	MaybeReadonly<{
	image?: DTImageFull
		model?: Model
		loras?: (Model | undefined)[]
		controls?: (Model | undefined)[]
	}>
>({
	image: undefined,
	model: undefined,
	loras: undefined,
	controls: undefined,
})



export function useDTImage() {
	return useContext(DTImageContext)
}
