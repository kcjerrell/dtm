import { Image } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { DtpService } from "@/commands"
import { uint8ArrayToBase64 } from "@/utils/helpers"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"
import { OpenPose } from "@/utils/poseHelpers"

interface PoseImageComponentProps extends ChakraProps {
    projectId?: number
    tensorId?: string
}

function PoseImage(props: PoseImageComponentProps) {
    const { projectId, tensorId, ...restProps } = props
    const [src, setSrc] = useState<string | undefined>(undefined)

    useEffect(() => {
        if (projectId && tensorId) {
            DtpService.getResourceJson(projectId, null, tensorId).then(async (data) => {
                // const points = tensorToPoints(data)
                // const pose = pointsToPose(points, 256, 256)
                const pose: OpenPose = JSON.parse(data)
                const image = await drawPose(
                    pose,
                    Math.floor(Math.max(pose.width, pose.height) / 64),
                )
                if (image) setSrc(`data:image/png;base64,${await uint8ArrayToBase64(image)}`)
            })
        }
    }, [tensorId, projectId])

    return <Image src={src} {...restProps} />
}

export default PoseImage
