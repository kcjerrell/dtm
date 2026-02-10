import type { ComponentProps } from "react"
import { PanelButton } from ".."
import { useVideoContext } from "./context"

interface FpsButtonProps extends ComponentProps<typeof PanelButton> {}

function FpsButton(props: FpsButtonProps) {
    const { ...restProps } = props

    const { fps, setFps, state } = useVideoContext()

    return (
        <PanelButton
            size={"sm"}
            padding={1}
            onClick={() => setFps(state.fps === 16 ? 20 : state.fps === 20 ? 24 : 16)}
            {...restProps}
        >
            {fps}
        </PanelButton>
    )
}

export default FpsButton
