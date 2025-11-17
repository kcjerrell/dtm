import { useEffect } from "react"
import { ContentPane, LayoutRoot } from "./Containers"
import CurrentImage from "./components/CurrentImage"
import History from "./history/History"
import InfoPanel from "./infoPanel/InfoPanel"
import { loadImage2 } from "./state/imageLoaders"
import { createImageItem, selectImage } from "./state/store"
import Toolbar from "./toolbar/Toolbar"
import { useMetadataDrop } from "./useMetadataDrop"
import AppState from "@/hooks/appState"
import { fetchImage } from "@/utils/clipboard"
import { dtProject } from "@/commands"

function Metadata(props: ChakraProps) {
	const { ...restProps } = props
	const { handlers } = useMetadataDrop()

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

	useEffect(() => {
		if (AppState.store.viewRequests.metadata?.length) {
			const req = AppState.store.viewRequests.metadata.pop()
			console.log(req)
			if (req?.open) {
				const image = dtProject
					.decodeTensor(req.open.projectId, req.open.tensorId, true, req.open.nodeId)
					.then((im) => {
						createImageItem(im, "png", { source: "open", url: 'whatever' })
					})
			}
		}
	}, [])

	return (
		<LayoutRoot id={"metadata"} {...handlers} {...restProps}>
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
