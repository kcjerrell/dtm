import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener"
import { useMemo } from "react"
import { useSnapshot } from "valtio"
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
import type { ICommand1 } from "@/types"
import { save } from "@/utils/tauri"
import { loadImage2 } from "../state/interop"
import type MdItem from "../state/MdItem"
import { useMetadataStore } from "../state/metadataStore2"
import PinnedIcon from "./PinnedIcon"

export function useMediaItemCommands() {
    const mdStore = useMetadataStore()
    const snap = useSnapshot(mdStore.state)

    const commands: ICommand1<MdItem>[] = useMemo(
        () =>
            [
                {
                    id: "loadFromClipboard",
                    label: "Load image from clipboard",
                    icon: FiClipboard,
                    onClick: async () => {
                        try {
                            await loadImage2("general")
                        } catch (e) {
                            console.error(e)
                        }
                    },
                },
                {
                    id: "copyImage",
                    label: "Copy image",
                    icon: FiCopy,
                    requiresSelection: true,
                    getEnabled: (item) => !!item && !item.isVideo && item.storage.kind === "app",
                    onClick: async (item) => {
                        if (!item) return
                        await item.copyImageToClipboard()
                    },
                },
                {
                    id: "pinImage",
                    getLabel: (item) => (item?.pin ? "Unpin image" : "Pin image"),
                    icon: (props: { item: MdItem }) => <PinnedIcon pin={props.item?.pin} />,
                    requiresSelection: true,
                    onClick: async (item) => {
                        if (!item) return
                        const isPinned = typeof item?.pin === "number"
                        const pin = !isPinned
                        mdStore.pinImage(true, pin)
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
                    label: "Clear unpinned images",
                    onClick: () => mdStore.clearAll(true),
                    getEnabled: () => {
                        return (
                            snap.items.length > 0 &&
                            !snap.items.every((im) => typeof im.pin === "number")
                        )
                    },
                    // toolbarEnableMode: "hide",
                    icon: FiXCircle,
                },
                {
                    id: "saveImage",
                    label: "Save a copy",
                    onClick: async (item) => {
                        if (!item) return
                        const savePath = await save({
                            canCreateDirectories: true,
                            title: item.isVideo ? "Save video" : "Save image",
                            filters: [
                                { name: item.isVideo ? "Video" : "Image", extensions: [item.type] },
                            ],
                        })
                        if (savePath) {
                            await item.saveCopy(savePath)
                        }
                    },
                    requiresSelection: true,
                    getEnabled: (item) =>
                        !!item && (item.storage.kind === "app" || item.storage.kind === "file"),
                    icon: FiSave,
                },
                {
                    id: "openFolder",
                    label: "Open folder",
                    onClick: async (item) => {
                        if (!item?.source?.file) return
                        await revealItemInDir(item.source.file)
                    },
                    getEnabled: (item) => item?.source?.file != null,
                    toolbarEnableMode: "hide",
                    icon: FiFolder,
                },
                {
                    id: "openUrl",
                    label: "Open URL",
                    onClick: async (item) => {
                        if (!item?.source?.url) return
                        await openUrl(item.source.url)
                    },
                    getEnabled: (item) => item?.source?.url != null,
                    toolbarEnableMode: "hide",
                    icon: TbBrowser,
                },
            ] as ICommand1<MdItem>[],
        [snap.items, mdStore],
    )

    return commands
}

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
