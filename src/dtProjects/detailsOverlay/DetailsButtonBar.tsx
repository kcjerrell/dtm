import { type ComponentProps, type RefObject, useMemo, useState } from "react"
import type { Snapshot } from "valtio"
import type { ImageExtra } from "@/commands"
import CommandButton, { CancelExecute } from "@/components/CommandButton"
import type { VideoContextType } from "@/components/video/context"
import { useMenuContext } from "../MenuContext"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"
import type { UIControllerState } from "../state/uiState"
import { ResourceHandle } from "../util/resourceHandle"
import { DetailsButtonBarRoot } from "./common"

interface DetailsButtonBarProps
    extends Omit<
        ComponentProps<typeof DetailsButtonBarRoot>,
        "transition" | "color" | "translate"
    > {
    item?: ImageExtra
    show?: boolean
    subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
    project?: ProjectState
    videoRef?: React.RefObject<VideoContextType | null>
}
function DetailsButtonBar(props: DetailsButtonBarProps) {
    const { item: itemProp, show, subItem, project, videoRef, ...restProps } = props
    const [lockButtons, setLockButtons] = useState(false)

    const { uiState } = useDTP()

    const { imageCommands } = useMenuContext()
    const resource = ResourceHandle.from(subItem ?? itemProp)

    const context = useMemo(
        () => ({
            videoRef: videoRef as RefObject<VideoContextType | null>,
        }),
        [videoRef],
    )

    if (!resource) return null

    const commandItem = resource ? [resource] : []

    return (
        <DetailsButtonBarRoot
            aria-label={"Image actions"}
            role={"toolbar"}
            data-solid
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            pointerEvents="auto"
            {...restProps}
        >
            {imageCommands.map((cmd) => (
                <CommandButton<
                    ResourceHandle,
                    { videoRef: React.RefObject<VideoContextType | null> }
                >
                    key={cmd.id}
                    command={cmd}
                    selectedItems={commandItem}
                    context={context}
                    disabled={lockButtons}
                    beforeExecute={(ctx) => {
                        if (lockButtons) throw new CancelExecute()
                        setLockButtons(true)
                        return ctx
                    }}
                    wrapper={async (execute, selected, ctx) => {
                        if (cmd.noSpinner) return await execute(selected, ctx)
                        await uiState.callWithSpinner(async () => await execute(selected, ctx))
                    }}
                    afterExecute={() => {
                        setLockButtons(false)
                    }}
                />
            ))}
        </DetailsButtonBarRoot>
    )
}

export default DetailsButtonBar
