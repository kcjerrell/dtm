import { chunk } from "./helpers"
import { getPoses, isOpenPose, type OpenPose, type Pose2d } from "./poseHelpers"

const limbSeq = [
	[1, 2],
	[1, 5],
	[2, 3],
	[3, 4],
	[5, 6],
	[6, 7],
	[1, 8],
	[8, 9],
	[9, 10],
	[1, 11],
	[11, 12],
	[12, 13],
	[1, 0],
	[0, 14],
	[14, 16],
	[0, 15],
	[15, 17],
	// [2, 16],
	// [5, 17],
]

const limbSeqData = [
	[1, 2, "right shoulder", 192, 130, 130],
	[1, 5],
	[2, 3],
	[3, 4],
	[5, 6],
	[6, 7],
	[1, 8],
	[8, 9],
	[9, 10],
	[1, 11],
	[11, 12],
	[12, 13],
	[1, 0],
	[0, 14],
	[14, 16],
	[0, 15],
	[15, 17],
	// [2, 16],
	// [5, 17],
]

const colors = [
	[255, 0, 0],
	[255, 85, 0],
	[255, 170, 0],
	[255, 255, 0],
	[170, 255, 0],
	[85, 255, 0],
	[0, 255, 0],
	[0, 255, 85],
	[0, 255, 170],
	[0, 255, 255],
	[0, 170, 255],
	[0, 85, 255],
	[0, 0, 255],
	[85, 0, 255],
	[170, 0, 255],
	[255, 0, 255],
	[255, 0, 170],
	[255, 0, 85],
]

export function tensorToPoints(data: Uint8Array<ArrayBuffer>) {
	const floats = new Float32Array(data.buffer)
	return [...floats]
}

export function pointsToPose(points: number[], width: number, height: number) {
	const dtPose = []

	for (let i = 0; i < points.length; i += 2) {
		const x = points[i]
		const y = points[i + 1]
		if (x === -1 && y === -1) dtPose.push(0, 0, 0)
		else dtPose.push(...[points[i] * width, points[i + 1] * height, 1])
	}
	const pose = {
		people: chunk(dtPose, 54).map((p) => ({
			pose_keypoints_2d: p,
		})),
		width,
		height,
	}

	return pose
}

export async function drawPose(pose: OpenPose, stickWidth = 4) {
	let poses: Pose2d[]
	if (Array.isArray(pose)) {
		poses = pose
	} else if (isOpenPose(pose)) {
		poses = getPoses(pose)
	} else {
		poses = [pose]
	}

	const width = pose.width
	const height = pose.height

	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = height

	const ctx = canvas.getContext("2d")
	if (!ctx) return
	ctx.rect(0, 0, width, height)
	ctx.fillStyle = "black"
	ctx.fill()

	for (const p of poses) {
		for (let i = 0; i < limbSeq.length; i++) {
			const [a, b] = limbSeq[i]
			const pa = p.joints[a]
			const pb = p.joints[b]

			if (!pa || !pb || pa.point.confidence < 1 || pb.point.confidence < 1) continue

			const length = Math.sqrt((pa.point.x - pb.point.x) ** 2 + (pa.point.y - pb.point.y) ** 2)
			const angle = Math.atan2(pb.point.y - pa.point.y, pb.point.x - pa.point.x)
			const center = { x: (pa.point.x + pb.point.x) / 2, y: (pa.point.y + pb.point.y) / 2 }

			ctx.beginPath()
			ctx.ellipse(center.x, center.y, length / 2, stickWidth, angle, 0, 2 * Math.PI)
			ctx.fillStyle = `rgba(${colors[i][0]}, ${colors[i][1]}, ${colors[i][2]}, 0.6)`
			ctx.fill()
		}

		for (let i = 0; i < p.joints.length; i++) {
			const joint = p.joints[i]
			ctx.beginPath()
			ctx.ellipse(joint.point.x, joint.point.y, stickWidth, stickWidth, 0, 0, 2 * Math.PI)
			ctx.fillStyle = `rgba(${colors[i][0]}, ${colors[i][1]}, ${colors[i][2]}, 0.6)`
			ctx.fill()
		}
	}

	const buffer = await canvasToBuffer(canvas, "image/png")

	return buffer
}

async function canvasToBuffer(
	canvas: HTMLCanvasElement,
	type: string,
): Promise<Uint8Array<ArrayBuffer>> {
	return new Promise((resolve) => {
		canvas.toBlob(async (blob) => {
			if (blob) resolve(new Uint8Array(await blob.arrayBuffer()))
			else resolve(new Uint8Array())
		}, type)
	})
}
