import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react"
import { ImageCompareContext } from "./state"

export interface ImageSelectorProps {
    image: "a" | "b"
    children: ReactNode
}

interface ImageSelectorContextValue {
    image: "a" | "b"
    setImage: (url: string) => void
}

const ImageSelectorContext = createContext<ImageSelectorContextValue | undefined>(undefined)

export function useImageSelector(): ImageSelectorContextValue {
    const context = useContext(ImageSelectorContext)
    if (!context) throw new Error("useImageSelector must be used within ImageCompare.ImageSelector")
    return context
}

function ImageSelector(props: ImageSelectorProps) {
    const { image, children } = props
    const state = ImageCompareContext.useContextState()
    const setImage = useCallback(
        (url: string) => {
            if (image === "a") state.imageASrc = url
            else state.imageBSrc = url
        },
        [image, state],
    )
    const value = useMemo(() => ({ image, setImage }), [image, setImage])

    return <ImageSelectorContext value={value}>{children}</ImageSelectorContext>
}

export default ImageSelector
