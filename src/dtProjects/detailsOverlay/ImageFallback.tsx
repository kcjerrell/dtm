import { Box } from "@chakra-ui/react"

interface ImageFallbackProps extends ChakraProps {}

function ImageFallback(props: ImageFallbackProps) {
    const { ...restProps } = props

    return (
        <div
            style={{
                width: "70%",
                alignSelf: "center",
                justifySelf: "center",
                // border: "1px solid #0000ff00",
                aspectRatio: "1",
                backgroundColor: "var(--chakra-colors-grays-8)",
                WebkitMaskImage: "url(/img_not_available.svg)",
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: "url(/img_not_available.svg)",
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
            }}
        />
    )
}

export default ImageFallback
