import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react"
import { useImageCompareHooks } from "./hooks"
import { ImageCompareContext } from "./state"

export interface ImageSelectorProps {
    image: "A" | "B"
    children: ReactNode
}

interface ImageSelectorContextValue {
    image: "A" | "B"
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

    const { setImage } = useImageCompareHooks()

    const value = useMemo(
        () => ({
            image,
            setImage: (url: string) => {
                setImage(image, url)
            },
        }),
        [image, setImage],
    )

    return <ImageSelectorContext value={value}>{children}</ImageSelectorContext>
}

export default ImageSelector
