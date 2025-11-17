import { save } from "@tauri-apps/plugin-dialog"
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener"
import { FiClipboard, FiCopy, FiFolder, FiSave, FiXCircle } from "react-icons/fi"
import type { IconType } from "react-icons/lib"
import { TbBrowser } from "react-icons/tb"
import { postMessage } from "@/context/Messages"
import ImageStore from "@/utils/imageStore"
import { loadImage2 } from "../state/imageLoaders"
import { clearAll, MetadataStore, pinImage } from "../state/store"
import PinnedIcon from "./PinnedIcon"

let separatorId = 0
const separator = () =>
	({ id: `separator-${separatorId++}`, separator: true }) as ToolbarCommand<unknown>

export const toolbarCommands: ToolbarCommand<typeof MetadataStore>[] = [
	{
		id: "loadFromClipboard",
		tip: "Load image from clipboard",
		icon: FiClipboard,
		action: async () => {
			try {
				await loadImage2("general")
			} catch (e) {
				console.error(e)
			}
		},
	},
	{
		id: "copyImage",
		tip: "Copy image to clipboard",
		action: async (store) => {
			if (!store.currentImage) return
			await ImageStore.copy(store.currentImage?.id)
		},
		check: (snap) => snap.currentImage != null,
		icon: FiCopy,
	},
	separator(),
	{
		id: "pinImage",
		getTip: (snap) => (snap.currentImage?.pin ? "Unpin image" : "Pin image"),
		getIcon: (snap: ReadonlyState<typeof MetadataStore>) => (
			<PinnedIcon pin={snap.currentImage?.pin} />
		),
		check: (snap) => snap.currentImage != null,
		action: async () => {
			const pin = MetadataStore.currentImage?.pin !== null ? null : true
			pinImage(true, pin)
			postMessage({
				message: pin ? "Image pinned" : "Pin removed",
				uType: "pinimage",
				duration: 2000,
				channel: "toolbar",
			})
		},
	},
	{
		id: "clearUnpinned",
		tip: "Clear unpinned images",
		action: () => clearAll(true),
		check: (snap) => snap.images.some((im) => im.pin == null),
		icon: FiXCircle,
	},
	separator(),
	{
		id: "saveImage",
		tip: "Save a copy",
		action: async (store) => {
			if (!store.currentImage) return
			const savePath = await save({
				canCreateDirectories: true,
				title: "Save image",
				filters: [{ name: "Image", extensions: [store.currentImage.type] }],
			})
			if (savePath) {
				await ImageStore.saveCopy(store.currentImage.id, savePath)
			}
		},
		check: (snap) => snap.currentImage != null,
		icon: FiSave,
	},
	{
		id: "openFolder",
		tip: "Open folder",
		slotId: "sourceOpen",
		action: async (store) => {
			if (!store.currentImage?.source?.file) return
			await revealItemInDir(store.currentImage?.source?.file)
		},
		check: (snap) => snap.currentImage?.source?.file != null,
		icon: FiFolder,
	},
	{
		id: "openUrl",
		slotId: "sourceOpen",
		tip: "Open URL",
		action: async (store) => {
			if (!store.currentImage?.source?.url) return
			await openUrl(store.currentImage.source.url)
		},
		check: (snap) => snap.currentImage?.source?.url != null,
		icon: TbBrowser,
	},
]

type SnapCallback<TArg, T2Arg = never, TRet = void> = (
	snap: ReadonlyState<TArg>,
	arg?: T2Arg,
) => TRet

export type ToolbarCommand<TArg, T2Arg = never> = {
	id: string
	action: (state: TArg, arg?: T2Arg) => void
	check?: SnapCallback<TArg, T2Arg, boolean>
	tip?: string
	getTip?: SnapCallback<TArg, T2Arg, string>
	icon?: IconType
	getIcon?: SnapCallback<TArg, T2Arg, React.ReactElement>
	separator?: true
	slotId?: string
}
