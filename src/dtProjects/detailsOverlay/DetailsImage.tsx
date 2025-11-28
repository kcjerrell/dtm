import { Box } from "@chakra-ui/react"
import { motion, type TargetAndTransition, useAnimate } from "motion/react"
import { type CSSProperties, useCallback, useRef } from "react"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsImageProps extends ChakraProps {
	src?: string
	srcHalf?: string
	sourceRect: ValueOrGetter<Nullable<DOMRectReadOnly>>
	naturalSize: { width: number; height: number }
	imgStyle?: CSSProperties
}

type LRect = { left: number; top: number; width: number; height: number }

function DetailsImage(props: DetailsImageProps) {
	const { src, srcHalf, sourceRect: sourceRectProp, naturalSize, imgStyle, ...restProps } = props

	const sourceRect = typeof sourceRectProp === "function" ? sourceRectProp() : sourceRectProp

	const imgContainerRef = useRef<HTMLDivElement>(null)
	const [scope, anim] = useAnimate()

	const imgOrigin = useRef<LRect | null>(null)
	const imgTarget = useRef<LRect | null>(null)
	const resized = useRef(false)

	const getImageAnimOpen = useCallback(() => {
		if (sourceRect && imgContainerRef.current) {
			const imgContainerRect = imgContainerRef.current.getBoundingClientRect()
			const posA = offsetRect(sourceRect, imgContainerRect)
			imgOrigin.current = posA

			const posB = offsetRect(
				contain(naturalSize, imgContainerRef.current.getBoundingClientRect()),
				imgContainerRef.current.getBoundingClientRect(),
			)
			imgTarget.current = posB

			return {
				top: [posA.top, posB.top],
				left: [posA.left, posB.left],
				width: [posA.width, posB.width],
				height: [posA.height, posB.height],
				borderRadius: ["1px", "4px"],
				transition: {
					times: [0, 1],
					duration: transition.duration,
					ease: "easeOut",
				},
			} as TargetAndTransition
		}
		return {}
	}, [sourceRect, naturalSize])

	const getImageAnimClose = useCallback(() => {
		const box = resized.current
			? {
					top: undefined, // [imgTarget.current?.top, null],
					left: undefined, // [imgTarget.current?.left, null],
					width: undefined, // [imgTarget.current?.width, null],
					height: undefined, // [imgTarget.current?.height, null],
					scale: [1, 0.5],
					opacity: [1, 0],
				}
			: {
					top: [null, imgOrigin.current?.top],
					left: [null, imgOrigin.current?.left],
					width: [null, imgOrigin.current?.width],
					height: [null, imgOrigin.current?.height],
				}

		return {
			...box,
			borderRadius: ["4px", "1px"],
			transition: {
				times: [0, 1],
				duration: transition.duration,
				ease: "easeOut",
			},
		} as TargetAndTransition
	}, [])

	const attachResizeObserver = useCallback(
		(elem: HTMLElement) => {
			let firstResize = true
			resized.current = false
			const ro = new ResizeObserver((entries) => {
				for (const entry of entries) {
					if (entry.target === elem) {
						if (firstResize) {
							firstResize = false
							continue
						}
						resized.current = true
						const imgContainerRect = elem.getBoundingClientRect()
						const pos = offsetRect(contain(naturalSize, imgContainerRect), imgContainerRect)
						anim(
							scope.current,
							{ top: pos.top, left: pos.left, width: pos.width, height: pos.height },
							{ duration: 0 },
						)
					}
				}
			})
			ro.observe(elem)
			return ro
		},
		[anim, naturalSize, scope],
	)

	return (
		<Box
			ref={(elem: HTMLDivElement | null) => {
				imgContainerRef.current = elem
				if (elem) {
					const ro = attachResizeObserver(elem)
					return () => ro.disconnect()
				}
			}}
			position={"relative"}
			{...restProps}
		>
			<motion.img
				ref={scope}
				src={src}
				style={{
					// backgroundColor: "#ff000077",
					backgroundImage: `url(${srcHalf})`,
					backgroundSize: "cover",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					position: "absolute",
					zIndex: 20,
					...imgStyle,
				}}
				variants={{
					open: () => getImageAnimOpen(),
					closed: () => getImageAnimClose(),
				}}
				initial={"closed"}
				animate={"open"}
				exit={"closed"}
			/>
		</Box>
	)
}

export default DetailsImage

function offsetRect(rect: DOMRectReadOnly, offset: DOMRectReadOnly) {
	return {
		top: rect.top - offset.top,
		left: rect.left - offset.left,
		width: rect.width,
		height: rect.height,
	}
}

function contain(object: { width: number; height: number }, container: DOMRectReadOnly) {
	const scale = Math.min(container.width / object.width, container.height / object.height)
	return new DOMRectReadOnly(
		container.left + (container.width - object.width * scale) / 2,
		container.top + (container.height - object.height * scale) / 2,
		object.width * scale,
		object.height * scale,
	)
}
