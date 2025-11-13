import { contain } from '@/components/preview'
import { Box } from '@chakra-ui/react'
import { motion, useAnimate, useMotionValue, ValueAnimationTransition } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'

const posTransition: ValueAnimationTransition<number> = {
	duration: 0.3,
	ease: "circOut",
}

interface DetailsImageProps extends ChakraProps {
  src: string
  showPreview: boolean
  sourceElement: HTMLImageElement
}

function DetailsImage(props: DetailsImageProps) {
	const { src, showPreview, sourceElement, ...restProps } = props

	// const snap = useSnapshot(store)

	const leftMv = useMotionValue(0)
	const topMv = useMotionValue(0)
	const widthMv = useMotionValue<number>(0)
	const heightMv = useMotionValue<number>(0)

	const [scope, animate] = useAnimate()

	const transRef = useRef<HTMLImageElement>(null)
	const finalRef = useRef<HTMLImageElement>(null)

	// const keyHandler = useCallback((e: KeyboardEvent) => {
	// 	if (e.key === "Escape" || e.key === " ") {
	// 		e.stopImmediatePropagation()
	// 		hidePreview()
	// 	}
	// 	if (e.key === "Tab") {
	// 		e.stopImmediatePropagation()
	// 		e.preventDefault()
	// 	}
	// }, [])

	useEffect(() => {
		if (!sourceElement || !transRef.current || !finalRef.current) return

		// if (show) {
		// 	document.addEventListener("keydown", keyHandler, { capture: true })
		// }

		const originalRect = sourceElement.getBoundingClientRect()
		const previewRect = contain(
			sourceElement.naturalWidth,
			sourceElement.naturalHeight,
			window.innerWidth,
			window.innerHeight,
		)

		const sourceRect = showPreview ? originalRect : previewRect
		const targetRect = showPreview ? previewRect : originalRect

		const { left, top, width, height } = sourceRect

		leftMv.set(left)
		widthMv.set(width)
		topMv.set(top)
		heightMv.set(height)

		animate(leftMv, targetRect.left, posTransition)
		animate(topMv, targetRect.top, posTransition)
		animate(widthMv, targetRect.width, posTransition)
		animate(heightMv, targetRect.height, posTransition)

		animate(
			transRef.current,
			{ visibility: ["hidden", "visible", "visible", "hidden"] },
			{ duration: posTransition.duration, times: [0, 0, 1, 1] },
		)

		animate(
			finalRef.current,
			{ visibility: ["hidden", "hidden", showPreview ? "visible" : "hidden"] },
			{ duration: posTransition.duration, times: [0, 1, 1] },
		)

		animate(
			sourceElement,
			{ visibility: ["hidden", "hidden", showPreview ? "hidden" : "visible"] },
			{ duration: posTransition.duration, times: [0, 1, 1] },
		)

		// return () => {
		// 	document.removeEventListener("keydown", keyHandler, { capture: true })
		// }
	}, [animate, heightMv, leftMv, widthMv, topMv, showPreview, sourceElement])

	return (
		<Box
			ref={scope}
			width={"100vw"}
			height={"100vh"}
			overflow={"clip"}
			position={"absolute"}
			zIndex={20}
			bgColor={"black/90"}
			// onClick={() => hidePreview()}
			pointerEvents={showPreview ? "all" : "none"}
			{...restProps}
			asChild
		>
			<motion.div
				initial={{
					opacity: 0,
					backgroundColor: "#00000000",
				}}
				animate={{
					backgroundColor: showPreview ? "#000000dd" : "#00000000",
					opacity: showPreview ? 1 : 0,
				}}
				transition={{
					...posTransition,
					duration: showPreview ? (posTransition.duration ?? 0) * 1.5 : posTransition.duration,
					opacity: {
						duration: 0,
						delay: showPreview ? 0 : posTransition.duration,
					},
				}}
			>
				<motion.img
					ref={transRef}
					style={{
						position: "absolute",
						objectFit: "contain",
						left: leftMv,
						top: topMv,
						width: widthMv,
						height: heightMv,
					}}
					src={src ?? undefined}
					transition={posTransition}
				/>
				<motion.img
					ref={finalRef}
					style={{
						position: "absolute",
						objectFit: "contain",
						left: 0,
						top: 0,
						width: "100%",
						height: "100%",
					}}
					src={src ?? undefined}
					transition={posTransition}
				/>
			</motion.div>
		</Box>
	)
}

export default DetailsImage