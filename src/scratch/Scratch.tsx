import { SliderWithInput } from '@/components'
import { clipboardTextTypes, parseText } from "@/metadata/state/imageLoaders"
import { getClipboardTypes, getClipboardText } from "@/utils/clipboard"
import { shuffle } from "@/utils/helpers"
import { Box, Center, chakra, HStack, SimpleGrid, VStack } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import {
	cubicBezier,
	motion,
	MotionProps,
	MotionValue,
	useMotionValue,
	useTransform,
	transform,
	mapValue,
	transformValue,
	useSpring,
	useMotionTemplate,
} from "motion/react"
import { PropsWithChildren, useEffect, useMemo, useState } from "react"
import { proxy, useSnapshot } from "valtio"

const store = proxy({
	file: "",
	// sourceX: 34,
	// sourceY: 55,
	angle: 45,
	depth: 5,
	bgOpacity: 0.3,
	shadOpacity: 0.2,
	focus: 2,
	n: 2,
	d: 16,
	z1: 0,
	z2: 0,
	p: 300,
})

const params = [
	// ["sourceX", 0, 100, 1],
	// ["sourceY", 0, 100, 1],
	["angle", 0, 360, 1],
	["depth", 0, 20, 1],
	["focus", 0, 16, 1],
	["bgOpacity", 0, 1, 0.01],
	["shadOpacity", 0, 1, 0.01],
	["n", 1, 16, 1],
	["d", 1, 64, 1],
	["z1", -100, 100, 1],
	["z2", -100, 100, 1],
	["p", 0, 4000, 1],
] as [string, number, number, number][]

const params2 = [
	["curve_a", 0, 10, 0.01, new MotionValue(1)],
	["curve_b", 0, 10, 0.01, new MotionValue(1)],
	["curve_c", 0, 1, 0.01, new MotionValue(1)],
	["curve_d", 0, 1, 0.01, new MotionValue(1)],
] as const

const params2p = proxy({
	curve_a: 1,
	curve_b: 1,
	curve_c: 1,
	curve_d: 1,
})

function mapA(input_a, minA = 0.1, maxA = 10) {
	// logarithmic interpolation
	const logMin = Math.log(minA)
	const logMax = Math.log(maxA)
	const logA = logMin + (logMax - logMin) * input_a
	return Math.exp(logA)
}

const mvA = transformValue(() => params2[0][4].get()) //mapA(params2[0][4].get()))
const mvB = transformValue(() => params2[1][4].get()) //mapA(params2[1][4].get()))

const easeB = () => (x) => {
	const a = mvA.get()
	const b = mvB.get()
	return x ** a / (x ** a + (1 - x) ** b)
}

function DPoint(props) {
	const { x, width, height } = props
	// single param
	// const y = useTransform(mvA, (a) => x ** a / (x ** a + (1 - x) ** a))
	// two params
	const y = useTransform<number, number>([mvA, mvB], ([a, b]) => x ** a / (x ** a + (1 - x) ** b))
	const px = x * width
	const py = useTransform(y, [0, 1], [height, 0])
	const psy = useSpring(py)

	return (
		<motion.div
			style={{
				width: "2px",
				height: "2px",
				backgroundColor: "red",
				position: "absolute",
				// borderRadius: "50%",
				left: 0,
				top: 0,
				x: px,
				y: psy,
			}}
		/>
	)
}

function Scratch(props: ChakraProps) {
	const snap = useSnapshot(store)
	const handlers = useMemo(
		() => ({
			onDrop: async (e: React.DragEvent<HTMLDivElement>) => {
				e.preventDefault()
				const types = await getClipboardTypes("drag")
				const cliptext = await getClipboardText(
					clipboardTextTypes.filter((t) => types.includes(t)),
					"drag",
				)
				for (const [type, text] of Object.entries(cliptext)) {
					const { files } = parseText(text, type)
					if (files.length > 0) {
						store.file = files[0]
						invoke("load_metadata", { filepath: files[0] })
						return
					}
				}
			},
			onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
				e.preventDefault()
			},
		}),
		[],
	)

	const { items } = getMotionItems(512, 512, 32)

	const boxShadow = shadow({ ...snap })

	const mx = useSpring(0, {})
	const my = useSpring(0, {})
	const mxb = useSpring(0, {})
	const myb = useSpring(0, {})

	const [tempA, setTempA] = useState(0)
	const [tempB, setTempB] = useState(0)

	const tx = useTransform(mx, [0, 1], [-15, 15])
	const ty = useTransform(my, [0, 1], [-15, 15])

	const po = useMotionTemplate`${mx.get() * 100}px ${my.get() * 100}px`

	return (
		<VStack {...handlers} {...props}>
			<Box>Hello</Box>
			<Box>{snap.file}</Box>
			{/* <svg id={"check"} width={"64px"} height={"64px"} viewBox={"0 0 64 64"}>
				<title>check</title>
				<rect width={"64px"} height={"64px"} fill={"blue"} />
				<rect x={0} y={0} width={"32px"} height={"32px"} fill={"red"} />
				<rect x={32} y={32} width={"32px"} height={"32px"} fill={"red"} />
			</svg>
			<svg width={512} height={512} viewbox={"0 0 512 512"}>
				<title>bg</title>
				<rect style={{ fill: "var(--chakra-colors-bg-1)" }} width={512} height={512} />
				{items.map((item) => {
					return <motion.rect key={item.index} {...item} />
				})}
			</svg> */}
			<HStack
				bgImage={"url(/check_light.png)"}
				width={"500px"}
				height={"300px"}
				bgSize={"50px"}
				alignItems={"center"}
			>
				<Box width={"5rem"} bgColor={"red/20"} height={"100%"}></Box>
				<Center
					position={"relative"}
					flex={"1 1 auto"}
					height={"100%"}
					bgColor={"blue/10"}
					onPointerMove={(e) => {
						const box = e.currentTarget.getBoundingClientRect()
						const px = (e.clientX - box.left) / box.width
						const py = (e.clientY - box.top) / box.height
						if (e.shiftKey) {
							setTempA(px * 150 - 75)
							setTempB(py * 80 - 40)
						} else {
							mx.set(px)
							my.set(py)
						}
					}}
					perspective={`${snap.p}px`}
					transformStyle={"preserve-3d"}
				>
					<Surface
						top={"40%"}
						left={"40%"}
						bgColor={"blue/10"}
						width={"80px"}
						height={"80px"}
						border={"1px dashed {gray/20}"}
						mx={mx}
						my={my}
					>
						<MotionBox
							position={"absolute"}
							inset={"5px"}
							bgColor={"red/20"}
							border={"2px solid black"}
							transformStyle={"preserve-3d"}
							animate={{
								"--something": ["0px", "20px"],
								rotateZ: [0, 45]
							}}
							initial={{
								"--something": "0px"
							}}
							transition={{ duration: 1, repeat: Infinity, repeatType: "loop", times: [0, 1] }}
							_after={{
								content: '""',
								position: "absolute",
								inset: "var(--something)",
								transform: "translateZ(var(--something))",
								bgColor: "blue/20",
								border: "2px solid black",
							}}
						/>
						<MotionBox
							position={"absolute"}
							inset={"5px"}
							bgColor={"green/20"}
							border={"2px solid black"}
							style={{
								rotateY: 90,
							}}
							transformStyle={"preserve-3d"}
							transformOrigin={"left"}
						/>
					</Surface>

					{/* {Array.from({ length: 120 }).map((_, i, arr) => {
							const x = i / (arr.length - 1)
							return <DPoint key={i} x={x} width={120} height={120} /> */}
				</Center>
				<Box width={"50px"} bgColor={"red/20"} height={"300px"} position={"relative"}>
					<motion.div
						style={{
							position: "absolute",
							left: "10px",
							width: "30px",
							height: "30px",
							backgroundColor: "black",
						}}
						animate={{
							top: ["0px", "270px"],
						}}
						transition={{
							repeat: Infinity,
							repeatType: "loop",
							duration: 2,
							ease: easeB(),
						}}
					/>
				</Box>
			</HStack>
			<SimpleGrid gridTemplateColumns={"repeat(3, 1fr)"} gap={4}>
				{params.map(([key, min, max, step]) => (
					<SliderWithInput
						width={"180px"}
						key={key}
						label={key}
						value={snap[key]}
						onValueChange={(v) => {
							store[key] = v
						}}
						min={min}
						max={max}
						step={step}
						immediate={true}
					/>
				))}
				{params2.map(([key, min, max, step, mv]) => (
					<SliderWithInput
						width={"180px"}
						key={key}
						label={key}
						onValueChange={(v) => {
							mv.set(v)
							params2p[key] = v
						}}
						min={min}
						max={max}
						step={step}
						immediate={true}
					/>
				))}
			</SimpleGrid>
		</VStack>
	)
}

// times will be normalized
// we'll do a checkerboard of dots popping in in random order
// then they'll expand into squares
// t=0 nothing
// t=0-1 all dots fade in
// t=1-2 dots become squares
// (the duration of 0-1 and 1-2 can be adjusted, and a gap can be added)

type SequenceItem = {
	index: number
	initial: MotionProps["initial"]
	animate: MotionProps["animate"]
	transition: MotionProps["transition"]
	style: MotionProps["style"]
}
const curves = [cubicBezier(0.74, 0.19, 0.87, 0.29), cubicBezier(0.1, 0.91, 0.87, 0.29)]
const totalDuration = 5
const phases = [
	[0, 2],
	[3, 4],
]

const norm = (times: number[], phaseIndex: number) => {
	const phase = phases[phaseIndex]
	const duration = phase[1] - phase[0]

	return times.map((t) => (curves[phaseIndex](t) * duration + phase[0]) / totalDuration)
}

function getMotionItems(width: number, height: number, size: number): { items: SequenceItem[] } {
	const nCols = Math.ceil(width / size)
	const nRows = Math.ceil(height / size)
	const nItems = nCols * nRows

	const radiusSequence = [size / 8, size / 8, 0, 0]
	const sizeSequence = [size / 4, size / 4, size, size]
	// const sizeTimes = [0, 1, 2]
	const sizeDuration = 0.5
	const sizeTimes = (ti) => [
		0,
		(ti / nItems) * (1 - sizeDuration / totalDuration),
		(ti / nItems + sizeDuration / totalDuration) * (1 - sizeDuration / totalDuration),
		1,
	]

	const getX = (i) => Math.floor(i / nRows)
	const xSequence = (x) => [
		x * size + (size * 3) / 8,
		x * size + (size * 3) / 8,
		x * size,
		x * size,
	]

	const getY = (i) => i % nRows
	const ySequence = (y) => [
		y * size + (size * 3) / 8,
		y * size + (size * 3) / 8,
		y * size,
		y * size,
	]

	const getColorIndex = (i) => ((getX(i) % 2) + (getY(i) % 2)) % 2

	const opacityDuration = 0.1
	const opacitySequence = [0, 0, 1, 1]
	const opacityTimes = (ti) => [
		0,
		(ti / nItems) * (1 - opacityDuration / totalDuration),
		(ti / nItems + opacityDuration / totalDuration) * (1 - opacityDuration / totalDuration),
		1,
	]

	const sizeTrans = (ti) =>
		({
			times: norm(sizeTimes(ti), 1),
			duration: 4,
			repeat: Infinity,
			repeatType: "loop",
		}) as MotionProps["transition"]

	const indexes = shuffle(Array.from({ length: nItems }).map((_, i) => i))

	const items = indexes.map((index, ti) => {
		const style: MotionProps["style"] = {
			fill: `var(--chakra-colors-check-${getColorIndex(index) + 1})`,
		}
		const initial: MotionProps["initial"] = {
			opacity: 0,
		}
		const animate: MotionProps["animate"] = {
			opacity: opacitySequence,
			x: xSequence(getX(index)),
			y: ySequence(getY(index)),
			rx: radiusSequence,
			ry: radiusSequence,
			width: sizeSequence,
			height: sizeSequence,
		}

		const si = ((getX(index) + getY(index)) / (nCols + nRows)) * nItems
		const transition: MotionProps["transition"] = {
			opacity: {
				duration: 4,
				repeat: Infinity,
				repeatType: "loop",
				times: norm(opacityTimes(ti), 0),
			},
			x: sizeTrans(si),
			y: sizeTrans(si),
			rx: sizeTrans(si),
			ry: sizeTrans(si),
			width: sizeTrans(si),
			height: sizeTrans(si),
		}

		return { index, initial, animate, transition, style }
	})

	return { items }
}

function shadow(opts: typeof store) {
	const { angle, depth, bgOpacity, shadOpacity, focus, n, d } = opts

	const getXY = (dist: number) => {
		const rad = (angle * Math.PI) / 180
		const x = dist * Math.cos(rad)
		const y = dist * Math.sin(rad)
		return `${x.toFixed(2)}px ${y.toFixed(2)}px`
	}

	const scale = 1 + depth / 80

	const bs = Array.from({ length: n }, (_, i) => {
		const p = n > 1 ? i / (n - 1) : 0
		const dist = (d * p * depth) / 5

		return `${getXY(dist)} ${focus + depth * p ** 2}px ${-1}px rgba(0, 0, 0, ${shadOpacity})`
	}).join(", ")

	return {
		boxShadow: bs,
		// filter: `drop-shadow(${bs})`,
		backdropFilter: `blur(${depth / 5}px)`,
		backgroundColor: `rgba(237, 238, 240, ${bgOpacity})`,
		scale: scale,
	}
}

export default Scratch

// 64, 0 - 64
// 16  24 - 40

const MotionBox = chakra(motion.div, {
	base: {},
})
type MBProps = Parameters<typeof MotionBox>[0] & {
	mx: MotionValue<number>
	my: MotionValue<number>
}

const Surface = (props: MBProps) => {
	const { mx, my, ...rest } = props
	const { outer, inner } = splitProps(rest)

	const skewY = useTransform(mx, [0, 1], [0, 0])
	const rotateY = useTransform(mx, [0, 1], [35, -35])
	const skewX = useTransform(mx, [0, 1], [0, 0])
	const rotateX = useTransform(my, [0, 1], [-35, 35])

	return (
		<MotionBox
			style={{ rotateY, rotateX, skewX, skewY }}
			position={"absolute"}
			transformStyle={"preserve-3d"}
			{...outer}
		>
			<MotionBox
				position={"relative"}
				width={"100%"}
				height={"100%"}
				transformStyle={"preserve-3d"}
				{...inner}
			>
				{props.children}
			</MotionBox>
		</MotionBox>
	)
}

function splitProps(props: Partial<MBProps>) {
	const { width, height, animate, initial, transition, top, left, bottom, right, ...rest } = props
	const outer = { width, height, animate, initial, transition, top, left, bottom, right }

	return { outer, inner: rest }
}
