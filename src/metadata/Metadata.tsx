import { useEffect } from "react"
import { ContentPane, LayoutRoot } from "./Containers"
import CurrentImage from "./components/CurrentImage"
import History from "./history/History"
import InfoPanel from "./infoPanel/InfoPanel"
import { loadImage2 } from "./state/imageLoaders"
import { selectImage } from "./state/metadataStore"
import Toolbar from "./toolbar/Toolbar"

function Metadata(props: ChakraProps) {
    const { ...restProps } = props

    useEffect(() => {
        const handler = () => loadImage2("general")
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                selectImage(null)
            }
        }
        window.addEventListener("paste", handler)
        window.addEventListener("keydown", escHandler, { capture: false })

        return () => {
            window.removeEventListener("paste", handler)
            window.removeEventListener("keydown", escHandler)
        }
    }, [])

    return (
        <LayoutRoot id={"metadata"} {...restProps}>
            <ContentPane>
                <Toolbar zIndex={3} />
                <CurrentImage />
                <History zIndex={2} />
            </ContentPane>
            <InfoPanel />
        </LayoutRoot>
    )
}

export default Metadata
