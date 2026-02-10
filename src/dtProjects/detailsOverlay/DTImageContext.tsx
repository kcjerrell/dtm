import { createContext, useContext } from "react"
import type { DTImageFull, Model } from "@/commands"

export const DTImageContext = createContext<
    MaybeReadonly<{
        image?: DTImageFull
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
