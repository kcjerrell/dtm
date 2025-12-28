import { Box, type BoxProps } from "@chakra-ui/react"
import {
	type MotionProps,
	motion,
	useAnimate,
	useMotionValue,
	type ValueAnimationTransition,
} from "motion/react"
import { createRef, useEffect, useRef } from "react"
import { proxy, ref, useSnapshot } from "valtio"
import { Hotkey } from "@/hooks/keyboard"

const store = proxy({
	showPreview: false,
	sourceElement: ref(createRef<HTMLImageElement | null>()),
	src: null as string | null,
	isLoaded: false,
})

export function showPreview(srcElem?: HTMLImageElement | null, src?: string) {
	store.sourceElement.current = srcElem ?? null
	const newSrc = src ?? srcElem?.src ?? null
	if (newSrc !== store.src) {
		store.src = newSrc
		store.isLoaded = false
	}
	if (store.src) store.showPreview = true
}

export function hidePreview() {
	store.showPreview = false
}

export function useIsPreviewActive() {
	const { showPreview } = useSnapshot(store)
	return showPreview
}

interface PreviewProps extends BoxProps {}

const posTransition: ValueAnimationTransition<number> = {
	duration: 0.3,
	ease: "circOut",
}

export function Preview(props: PreviewProps) {
	const { ...restProps } = props
	const snap = useSnapshot(store)
	const { src, showPreview: show, sourceElement, isLoaded } = snap

	if (sourceElement.current) return <PreviewZoom key={src} {...restProps} />

	return (
		<Box
			key={src}
			width={"100vw"}
			height={"100vh"}
			overflow={"clip"}
			position={"absolute"}
			zIndex={20}
			bgColor={"black/90"}
			onClick={() => hidePreview()}
			pointerEvents={show ? "all" : "none"}
			{...restProps}
			asChild
		>
			<motion.div
				style={{
					backgroundColor: "#000000",
				}}
				initial={{
					backgroundColor: "#000000",
					// opacity: 0,
				}}
				animate={{
					backgroundColor: show ? "#000000dd" : "#00000000",
					// opacity: show ? 1 : 0,
				}}
				transition={{
					// ...posTransition,
					// duration: show ? (posTransition.duration ?? 0) * 1.5 : posTransition.duration,
					// opacity: {
					// 	duration: 0,
					// 	delay: show ? 0 : posTransition.duration,
					// },
					duration: 0.2,
					delay: show ? 0 : 0.1,
					ease: "circOut",
				}}
			>
				{show && !isLoaded && (
					<DotSpinner
						color={"check.1"}
						position={"absolute"}
						width={"20%"}
						height={"20%"}
						top={"40%"}
						left={"40%"}
					/>
				)}

				<motion.img
					ref={(e) => {
						if (e)
							e.onload = () => {
								// setTimeout(() => {
								store.isLoaded = true
								// }, 5000)
							}
					}}
					style={{
						// position: "absolute",
						objectFit: "contain",
						// left: 0,
						// top: 0,
						width: "100%",
						height: "100%",
						transformOrigin: "center center",
					}}
					initial={{
						opacity: 0,
						scale: 0.9,
					}}
					animate={{
						opacity: isLoaded && show ? 1 : 0,
						scale: isLoaded && show ? 1 : 0.9,
					}}
					src={src ?? undefined}
					transition={{ duration: 0.2, delay: show ? 0.1 : 0, ease: "circOut" }}
				/>
			</motion.div>
		</Box>
	)
}

function PreviewZoom(props: PreviewProps) {
	const { ...restProps } = props

	const snap = useSnapshot(store)
	const { src, showPreview: show } = snap

	const leftMv = useMotionValue(0)
	const topMv = useMotionValue(0)
	const widthMv = useMotionValue<number>(0)
	const heightMv = useMotionValue<number>(0)

	const [scope, animate] = useAnimate()

	const transRef = useRef<HTMLImageElement>(null)
	const finalRef = useRef<HTMLImageElement>(null)

	useEffect(() => {
		const sourceElement = store.sourceElement.current
		if (!sourceElement || !transRef.current || !finalRef.current) return

		const originalRect = sourceElement.getBoundingClientRect()
		const previewRect = contain(
			sourceElement.naturalWidth,
			sourceElement.naturalHeight,
			window.innerWidth,
			window.innerHeight,
		)

		const sourceRect = store.showPreview ? originalRect : previewRect
		const targetRect = store.showPreview ? previewRect : originalRect

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
			{ visibility: ["hidden", "hidden", show ? "visible" : "hidden"] },
			{ duration: posTransition.duration, times: [0, 1, 1] },
		)

		animate(
			sourceElement,
			{ visibility: ["hidden", "hidden", show ? "hidden" : "visible"] },
			{ duration: posTransition.duration, times: [0, 1, 1] },
		)
	}, [animate, heightMv, leftMv, widthMv, topMv, show])

	return (
		<>
			{show && (
				<Hotkey
					scope="preview"
					handlers={{
						escape: () => hidePreview(),
					}}
				/>
			)}
			<Box
				ref={scope}
				width={"100vw"}
				height={"100vh"}
				overflow={"clip"}
				position={"absolute"}
				zIndex={20}
				bgColor={"black/90"}
				onClick={() => hidePreview()}
				pointerEvents={show ? "all" : "none"}
				{...restProps}
				asChild
			>
				<motion.div
					initial={{
						opacity: 0,
						backgroundColor: "#00000000",
					}}
					animate={{
						backgroundColor: show ? "#000000dd" : "#00000000",
						opacity: show ? 1 : 0,
					}}
					transition={{
						...posTransition,
						duration: show
							? (posTransition.duration ?? 0) * 1.5
							: posTransition.duration,
						opacity: {
							duration: 0,
							delay: show ? 0 : posTransition.duration,
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
		</>
	)
}

export function contain(
	naturalWidth: number,
	naturalHeight: number,
	innerWidth: number,
	innerHeight: number,
): DOMRect {
	const aspectRatio = naturalWidth / naturalHeight
	let width = innerWidth
	let height = innerWidth / aspectRatio

	if (height > innerHeight) {
		height = innerHeight
		width = innerHeight * aspectRatio
	}

	const left = (innerWidth - width) / 2
	const top = (innerHeight - height) / 2

	// DOMRect: x, y, width, height, top, right, bottom, left
	return {
		x: left,
		y: top,
		width,
		height,
		top,
		left,
		right: left + width,
		bottom: top + height,
	} as DOMRect
}

export function DotSpinner(props) {
	const { style, ...rest } = props

	return (
		<Box perspective={200} transformStyle={"preserve-3d"} {...rest}>
			<motion.svg
				style={{ perspective: 200, transformStyle: "preserve-3d" }}
				viewBox={"0 0 100 100"}
			>
				<Dot delay={0} cx={25} ix={-20} iy={5} />
				<Dot delay={0.2} cx={50} ix={5} iy={-20} />
				<Dot delay={0.4} cx={75} ix={20} iy={-5} />
			</motion.svg>
		</Box>
	)
}

const loopTrans = (delay: number) =>
	({
		repeat: Infinity,
		repeatType: "loop",
		times: [0, 0.1, 1],
		ease: ["backIn", "backOut", "linear"],
		duration: 1.5,
		delay,
	}) as MotionProps["transition"]

function Dot(props: Record<string, number>) {
	const { delay, cx, ix, iy, dur } = props
	return (
		<motion.ellipse
			cx={cx}
			cy={50}
			rx={5}
			ry={5}
			fill={"currentColor"}
			initial={{
				y: 0,
				opacity: 0,
			}}
			animate={{
				opacity: 1,
				// rx: [2, 8, 5],
				// ry: [2, 8, 5],
				y: [0, -15, 0],
				// cy: [0, 15, 0]
			}}
			transition={{ ...loopTrans(delay), opacity: { duration: 0.2, delay: delay } }}
		/>
	)
}
