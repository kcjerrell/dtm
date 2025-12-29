import { createContext, useContext } from "react"
import type { DTImageFull, Model } from "@/commands"

export const DTImageContext = createContext<
	MaybeReadonly<{
		image?: DTImageFull
		model?: Model
	}>
>({
	image: undefined,
	model: undefined,
})



export function useDTImage() {
	return useContext(DTImageContext)
}
