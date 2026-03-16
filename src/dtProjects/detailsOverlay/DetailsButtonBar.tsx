import { type ComponentProps, useState } from "react"
import type { Snapshot } from "valtio"
import type { ImageExtra } from "@/commands"
import CommandButton, { CancelExecute } from "@/components/CommandButton"
import type { VideoContextType } from "@/components/video/context"
import { useMenuContext } from "../MenuContext"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"
import type { UIControllerState } from "../state/uiState"
import { DetailsButtonBarRoot } from "./common"

interface DetailsButtonBarProps
    extends Omit<
        ComponentProps<typeof DetailsButtonBarRoot>,
        "transition" | "color" | "translate"
    > {
    item?: ImageExtra
    tensorId?: string
    show?: boolean
    addMetadata?: boolean
    subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
    project?: ProjectState
    videoRef?: React.RefObject<VideoContextType | null>
    isVideo?: boolean
}
function DetailsButtonBar(props: DetailsButtonBarProps) {
    const {
        item: itemProp,
        tensorId,
        show,
        addMetadata,
        subItem,
        project,
        videoRef,
        isVideo,
        ...restProps
    } = props
    const [lockButtons, setLockButtons] = useState(false)
    const [, setShowExportDialog] = useState(false)

    const { uiState } = useDTP()

    const { imageCommands } = useMenuContext()
    const item = subItem ?? itemProp
    const commandItem = item ? [item] : []

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
                <CommandButton
                    key={cmd.id}
                    command={cmd}
                    selectedItems={commandItem}
                    disabled={lockButtons}
                    beforeExecute={(ctx) => {
                        if (lockButtons) throw new CancelExecute()
                        setLockButtons(true)
                        return ctx
                    }}
                    wrapper={async (execute, selected, ctx) => {
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
