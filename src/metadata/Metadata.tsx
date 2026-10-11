import { useEffect } from "react"
import { ContentPane, LayoutRoot } from "./Containers"
import CurrentItem from "./components/CurrentItem"
import History from "./history/History"
import { VideoThumbnailProvider } from "./history/VideoThumbnailProvider"
import InfoPanel from "./infoPanel/InfoPanel"
import { loadImage2 } from "./state/interop"
import { useMetadataStore } from "./state/metadataStore2"
import Toolbar from "./toolbar/Toolbar"

function Metadata(props: ChakraProps) {
    const { ...restProps } = props
    const mdStore = useMetadataStore()

    useEffect(() => {
        const handler = () => loadImage2("general")
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                mdStore.selectImage(null)
            }
        }
        window.addEventListener("paste", handler)
        window.addEventListener("keydown", escHandler, { capture: false })

        return () => {
            window.removeEventListener("paste", handler)
            window.removeEventListener("keydown", escHandler)
        }
    }, [mdStore])

    return (
        <LayoutRoot id={"metadata"} {...restProps}>
            <VideoThumbnailProvider>
                <ContentPane>
                    <Toolbar zIndex={3} />
                    <CurrentItem />
                    <History zIndex={2} />
                </ContentPane>
                <InfoPanel />
            </VideoThumbnailProvider>
        </LayoutRoot>
    )
}

export default Metadata
