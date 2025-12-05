import { chakra } from "@chakra-ui/react/styled-system"
import urls from "@/commands/urls"
import PoseImage from "@/components/Pose"

const _thumbnailSize = "4rem"

interface ThumbnailProps extends ChakraProps {
	projectId: number
	tensorId: string
}
function TensorThumbnail(props: ThumbnailProps) {
	const { projectId, tensorId, ...restProps } = props

	if (tensorId?.startsWith("pose")) {
		return (
			<ThumbnailBase {...restProps} asChild>
				<PoseImage projectId={projectId} tensorId={tensorId} />
			</ThumbnailBase>
		)
	}

	const src = urls.tensor(projectId, tensorId, null, 100)
	return <ThumbnailBase src={src} {...restProps} />
}

const ThumbnailBase = chakra("img", {
	base: {
		width: _thumbnailSize,
		height: _thumbnailSize,
		objectFit: "cover",
		bgColor: "bg.1",
		border: "1px solid gray",
		transformOrigin: "center bottom",
		boxShadow: "0px 2px 14px -5px #00000044, 0px 1px 8px -3px #00000044, 1px 0px 3px 0px #00000044",
		zIndex: 1,
		_first: {
			borderInlineStartRadius: "lg",
		},
		_last: {
			borderInlineEndRadius: "lg",
		},
		_hover: {
			transform: "scale(1.1)",
			zIndex: 2,
			transition: "all 0.1s ease",
			boxShadow:
				"0px 2px 14px -2px #00000055, 0px 1px 8px -2px #00000055, 1px 0px 3px 0px #00000055",
		},
		transition: "all 0.2s ease",
	},
})

export default TensorThumbnail
