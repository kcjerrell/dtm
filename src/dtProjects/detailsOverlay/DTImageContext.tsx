import { createContext, useContext } from "react"
import type { DTImageFull, Model } from "@/commands"
import { TensorHistoryNode } from "@/commands/DTProjectTypes"

export const DTImageContext = createContext<
    MaybeReadonly<{
        image?: TensorHistoryNode
        model?: Model
        loras?: (Model | undefined)[]
        controls?: (Model | undefined)[]
        refiner?: Model
    }>
>({
    image: undefined,
    model: undefined,
    loras: undefined,
    controls: undefined,
    refiner: undefined,
})

export function useDTImage() {
    return useContext(DTImageContext)
}
