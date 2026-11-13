import { createContext, type ReactNode, useContext, useMemo } from "react"
import { useImageCompareHooks } from "./hooks"

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
ImageSelector.slot = "ImageCompare.ImageSelector"

export default ImageSelector
