import { Box, Button, HStack, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { MotionBox, Panel } from "@/components/common"
import { motion } from "motion/react"
import PVList from "@/components/virtualizedList/PVLIst"
import { useEffect, useMemo } from "react"
import PVGrid from "@/components/virtualizedList/PVGrid"
import { dtProject, pdb } from "@/commands"
import { chunk } from "@/utils/helpers"

const store = proxy({
	someState: "Hello",
	// data: [] as { r: number; g: number; b: number }[],
	data: [] as { h: number; s: number; l: number }[],
	palette: [] as ReturnType<typeof arrangePalette>,
	width: 32,
	height: 32,
})

function Empty(props) {
	const snap = useSnapshot(store)

	useEffect(() => {
		dtProject
			.decodeTensor(1, "tensor_history_117557853", false)
			// .decodeTensor(80, "color_palette_1222765681", false)
			.then((data) => {
				const buffer = new Uint8Array(data)

				const sized = resize(buffer, 768, 768, 32, 32)
				const pixels = Array(sized?.byteLength / 4)
				console.log(sized?.byteLength, "byte length")
				for (let i = 0; i < sized.byteLength; i += 4) {
					const r = sized[i]
					const g = sized[i + 1]
					const b = sized[i + 2]
					pixels[i / 4] = { r, g, b }
				}
				store.data = pixels.map((p) => rgbToHsl(p))
				store.palette = arrangePalette(store.data, 32, 32)
			})
			.catch(console.error)
	}, [])

	return (
		<CheckRoot width={"full"} height={"full"} zoom={1}>
			<Panel
				margin={"auto"}
				width={"60vw"}
				height={"60vw"}
				justifyContent={"stretch"}
				alignItems={"stretch"}
			>
				<motion.svg viewBox={`0 0 ${snap.width} ${snap.height}`}>
					{snap.palette.map((col, i, { length }) => {
						const [xa, ya] = [col.x1, col.y1]
						const [xb, yb] = [(snap.width * col.h) / 360, (snap.height * col.l) / 100]
						const [xc, yc] = [col.x2, col.y2]
						return (
							<motion.rect
								key={i}
								width={1}
								height={1}
								x={col.x1}
								y={col.y1}
								fill={hslToCss(col)}
								// initial={{ attrX: col.x1, attrY: col.y1 }}
								animate={{
									attrX: [xa, xa, xb, xb, xc, xc],
									attrY: [ya, ya, yb, yb, yc, yc],
								}}
								transition={{
									delay: (0.3 * i) / length,
									duration: 9,
									repeatType: "loop",
									repeat: Infinity,
									times: [
										0,
										0.25,
										0.28,
										// staggered by end y
										(col.y2 / snap.height) * 0.3 + 0.3,
										(col.y2 / snap.height) * 0.3 + 0.4,
										1,
									],
								}}
							/>
						)
					})}
				</motion.svg>
			</Panel>
		</CheckRoot>
	)
}

export default Empty

function Item(props) {
	if (props.value === null) return <Box>Loading...</Box>
	return (
		<Box bgColor={`#${(Math.floor(Math.random() * 0xffffff)).toString(16)}`} aspectRatio={"1 / 1"}>
			{props.index} {props.value}
		</Box>
	)
}

async function getItems(skip: number, take: number) {
	console.log("loading page", skip, take)
	await new Promise((r) => setTimeout(r, 500))

	return Array(take)
		.fill(null)
		.map((_, i) => i + skip)
}

function arrangePalette(
	colors: { h: number; s: number; l: number }[],
	width: number = 16,
	height: number = 16,
) {
	const out = colors.map((c, i) => ({
		...c,
		x1: i % width,
		y1: Math.floor(i / height),
		x2: 0,
		y2: 0,
	}))
	console.log(out.length, out.filter((c) => !c).length)
	const lSort = out.toSorted((a, b) => a.h - b.h)
	const lChunks = chunk(lSort, width)

	for (let y = 0; y < height; y++) {
		const hSort = lChunks[y].sort((a, b) => a.s - b.s)
		console.log(hSort)
		for (let x = 0; x < height; x++) {
			const col = hSort[x]
			if (!col) {
				// console.warn(y, x, hSort)
				continue
			}
			col.x2 = x
			col.y2 = y
		}
	}

	return out
}

function rgbToCss(color: { r: number; g: number; b: number }) {
	return `rgb(${color.r},${color.g},${color.b})`
}

function hslToCss(color: { h: number; s: number; l: number }) {
	return `hsl(${color.h},${color.s}%,${color.l}%)`
}

function rgbToHsl(p: { r: number; g: number; b: number }) {
	const r = p.r / 255
	const g = p.g / 255
	const b = p.b / 255

	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const delta = max - min

	let h = 0
	let s = 0
	const l = (max + min) / 2

	if (delta !== 0) {
		if (max === r) {
			h = ((g - b) / delta) % 6
		} else if (max === g) {
			h = (b - r) / delta + 2
		} else {
			h = (r - g) / delta + 4
		}
		h = Math.round(h * 60)
		if (h < 0) h += 360

		s = delta / (1 - Math.abs(2 * l - 1))
	}

	// return h in degrees, s and l as percentage strings to fit hsl(...) CSS usage
	return {
		h,
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	}
}

function resize(
	data: Uint8Array,
	oldWidth: number,
	oldHeight: number,
	newWidth: number,
	newHeight: number,
) {
	const canvas = document.createElement("canvas")
	canvas.width = Math.max(newWidth, oldWidth)
	canvas.height = Math.max(newHeight, oldHeight)
	const ctx = canvas.getContext("2d")
	if (!ctx) return

	const imageData = ctx.createImageData(oldWidth, oldHeight)
	for (let i = 0; i < oldHeight * oldWidth; i += 1) {
		imageData.data[i * 4 + 0] = data[i * 3 + 0]
		imageData.data[i * 4 + 1] = data[i * 3 + 1]
		imageData.data[i * 4 + 2] = data[i * 3 + 2]
		imageData.data[i * 4 + 3] = 255
	}
	ctx.putImageData(imageData, 0, 0)

	ctx.drawImage(canvas, 0, 0, oldWidth, oldHeight, 0, 0, newWidth, newHeight)

	return ctx.getImageData(0, 0, newWidth, newHeight).data
}
