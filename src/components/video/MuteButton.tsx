import IconButton, { type IconButtonProps } from "../IconButton"
import { FiVolume, FiVolume2 } from '../icons/icons'
import { useVideoContext } from "./context"


interface MuteButtonProps extends IconButtonProps {}

function MuteButton(props: MuteButtonProps) {
    const { ...restProps } = props

    const { controls, isMuted, audioSrc } = useVideoContext()

    if (!audioSrc) return null

    return (
        <IconButton
            flex={"0 0 auto"}
            onClick={() => {
                controls.setMute(-1)
            }}
            bgColor={"grays.12"}
            borderRadius={"full"}
            {...restProps}
        >
            {isMuted ? <FiVolume /> : <FiVolume2 />}
        </IconButton>
    )
}

export default MuteButton
