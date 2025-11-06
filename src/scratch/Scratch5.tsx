import { Box, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import { motion, useMotionTemplate, useSpring, useTransform } from "motion/react"

const store = proxy({
	someState: "Hello",
})

function Scratch5() {
	const snap = useSnapshot(store)

	const mx = useSpring(0, { bounce: 0, visualDuration: 0.05 })
	const my = useSpring(0, { bounce: 0, visualDuration: 0.05 })

	const rx = useTransform(my, [0, 1], [-90, 90])
	const ry = useTransform(mx, [0, 1], [90, -90])

	const sx = useTransform(() => Math.atan2(mx.get() - 0.5, my.get() - 0.5) * -10)
	const sy = useTransform(() => Math.atan2(my.get() - 0.5, mx.get() - 0.5) * 0)

	const boxShadow = useMotionTemplate`${ry}px ${rx}px 8px #00000077`
	const filter = useMotionTemplate`drop-shadow(${boxShadow})`
	const transition = {
		duration: 2,
		times: [0, 0.3, 1],
		repeat: Infinity,
		repeatType: "loop",
		ease: ["circOut", "circIn", "circIn"],
	}

	return (
		<CheckRoot width={"full"} height={"full"}>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel
					// perspective={"500px"}
					// transformStyle={"preserve-3d"}
					position={"relative"}
					width={"500px"}
					height={"500px"}
					onPointerMove={(e) => {
						const { width, height, x, y } = e.currentTarget.getBoundingClientRect()
						mx.set((e.clientX - x) / width)
						my.set((e.clientY - y) / height)
					}}
				>
					{/* <motion.svg
						width="500"
						height="500"
						viewBox="0 0 100 100"
						>
						<rect x="0" y="0" width="100" height="100" fill="gray" /> */}
					<motion.div
						style={{
							rotateX: rx,
							rotateY: ry,
							skewX: sx,
							skewY: sy,
							position: "absolute",
							backgroundColor: "gray",
							z: 100,
							top: 50,
							left: 50,
							right: 50,
							bottom: 50,
							perspective: "2000px",
							transformStyle: "preserve-3d",
						}}
					>
						<div
							style={{
								width: "80%",
								height: "80%",
								position: "relative",
								margin: "10%",
								transformStyle: "preserve-3d",
								transform: "translateZ(100px)",
							}}
						>
							<motion.div
								style={{
									position: "absolute",
									z: 100,
									inset: 80,
									backgroundColor: "#0000ff77",
								}}
							/>

							<motion.div
								style={{
									position: "absolute",
									z: 100,
									inset: 80,
									backgroundColor: "#ff000077",
									transformOrigin: "right center",
								}}
								animate={{
									rotateY: [0, -90, 0],
								}}
								transition={transition}
							/>
							<motion.div
								style={{
									position: "absolute",
									z: 100,
									inset: 80,
									backgroundColor: "#ff000077",
									transformOrigin: "left center",
								}}
								animate={{
									rotateY: [0, 90, 0],
								}}
								transition={transition}
							/>
							<motion.div
								style={{
									position: "absolute",
									z: 100,
									inset: 80,
									backgroundColor: "#00FF0077",
									transformOrigin: "top center",
								}}
								animate={{
									rotateX: [0, -90, 0],
								}}
								transition={transition}
							/>
							<motion.div
								style={{
									position: "absolute",
									z: 100,
									inset: 80,
									backgroundColor: "#00FF0077",
									transformOrigin: "bottom center",
								}}
								animate={{
									rotateX: [0, 90, 0],
								}}
								transition={transition}
							/>
						</div>
					</motion.div>

					{/* </motion.svg> */}
					<motion.span>{mx}</motion.span>
					<motion.span>{my}</motion.span>
					<motion.span>{boxShadow}</motion.span>
				</Panel>
			</VStack>
		</CheckRoot>
	)
}

export default Scratch5
