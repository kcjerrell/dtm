import { save } from "@tauri-apps/plugin-dialog"
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener"
import type { IconType } from "@/components/icons/icons"
import {
    FiClipboard,
    FiCopy,
    FiFolder,
    FiSave,
    FiXCircle,
    TbBrowser,
} from "@/components/icons/icons"
import { postMessage } from "@/state/Messages"
import ImageStore from "@/utils/imageStore"
import { loadImage2 } from "../state/imageLoaders"
import { clearAll, getMetadataStore, pinImage } from "../state/metadataStore"
import PinnedIcon from "./PinnedIcon"

let separatorId = 0
const separator = () =>
    ({ id: `separator-${separatorId++}`, separator: true }) as ToolbarCommand<unknown>

export const toolbarCommands: ToolbarCommand<ReturnType<typeof getMetadataStore>>[] = [
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
            if (!store.currentItem) return
            await ImageStore.copy(store.currentItem?.id)
        },
        check: (snap) => snap.currentItem != null,
        icon: FiCopy,
    },
    separator(),
    {
        id: "pinImage",
        getTip: (snap) => (snap.currentItem?.pin ? "Unpin image" : "Pin image"),
        getIcon: (snap: ReadonlyState<ReturnType<typeof getMetadataStore>>) => (
            <PinnedIcon pin={snap.currentItem?.pin} />
        ),
        check: (snap) => snap.currentItem != null,
        action: async () => {
            const pin = getMetadataStore().currentItem?.pin !== null ? null : true
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
        check: (snap) => snap.items.some((im) => im.pin == null),
        icon: FiXCircle,
    },
    separator(),
    {
        id: "saveImage",
        tip: "Save a copy",
        action: async (store) => {
            if (!store.currentItem) return
            const savePath = await save({
                canCreateDirectories: true,
                title: "Save image",
                filters: [{ name: "Image", extensions: [store.currentItem.type] }],
            })
            if (savePath) {
                await ImageStore.saveCopy(store.currentItem.id, savePath)
            }
        },
        check: (snap) => snap.currentItem != null,
        icon: FiSave,
    },
    {
        id: "openFolder",
        tip: "Open folder",
        slotId: "sourceOpen",
        action: async (store) => {
            if (!store.currentItem?.source?.file) return
            await revealItemInDir(store.currentItem?.source?.file)
        },
        check: (snap) => snap.currentItem?.source?.file != null,
        icon: FiFolder,
    },
    {
        id: "openUrl",
        slotId: "sourceOpen",
        tip: "Open URL",
        action: async (store) => {
            if (!store.currentItem?.source?.url) return
            await openUrl(store.currentItem.source.url)
        },
        check: (snap) => snap.currentItem?.source?.url != null,
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
