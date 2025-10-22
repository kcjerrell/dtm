export type OpenPose = {
	people: {
		pose_keypoints_2d: number[]
	}[]
	width: number
	height: number
}

export function isOpenPose(pose: Record<string, unknown>): pose is OpenPose {
	if (!pose || !Array.isArray(pose.people)) return false
	if ((pose.people as OpenPose["people"]).some((p) => p.pose_keypoints_2d.length !== 54))
		return false
	if (!pose.width || !pose.height) return false
	return true
}

export type Point = { x: number; y: number; confidence: number }

export type Pose2d = {
	neck: Joint
	leftArm: Joint[]
	rightArm: Joint[]
	leftLeg: Joint[]
	rightLeg: Joint[]
	leftEye: Joint[]
	rightEye: Joint[]
	joints: Joint[]
}

export const jointTypes = [
	"Nose",
	"Neck",
	"Right Shoulder",
	"Right Elbow",
	"Right Wrist",
	"Left Shoulder",
	"Left Elbow",
	"Left Wrist",
	"Right Hip",
	"Right Knee",
	"Right Ankle",
	"Left Hip",
	"Left Knee",
	"Left Ankle",
	"Right Eye",
	"Left Eye",
	"Right Ear",
	"Left Ear",
]

export const jointTypesReverse = {
	Nose: 0,
	Neck: 1,
	"Right Shoulder": 2,
	"Right Elbow": 3,
	"Right Wrist": 4,
	"Left Shoulder": 5,
	"Left Elbow": 6,
	"Left Wrist": 7,
	"Right Hip": 8,
	"Right Knee": 9,
	"Right Ankle": 10,
	"Left Hip": 11,
	"Left Knee": 12,
	"Left Ankle": 13,
	"Right Eye": 14,
	"Left Eye": 15,
	"Right Ear": 16,
	"Left Ear": 17,
}

export type JointType =
	| "Nose"
	| "Neck"
	| "Right Shoulder"
	| "Right Elbow"
	| "Right Wrist"
	| "Left Shoulder"
	| "Left Elbow"
	| "Left Wrist"
	| "Right Hip"
	| "Right Knee"
	| "Right Ankle"
	| "Left Hip"
	| "Left Knee"
	| "Left Ankle"
	| "Right Eye"
	| "Left Eye"
	| "Right Ear"
	| "Left Ear"

export const bodyGraph: Record<JointType, JointType | null> = {
	Nose: null,
	Neck: "Nose",
	"Right Shoulder": "Neck",
	"Right Elbow": "Right Shoulder",
	"Right Wrist": "Right Elbow",
	"Left Shoulder": "Neck",
	"Left Elbow": "Left Shoulder",
	"Left Wrist": "Left Elbow",
	"Right Hip": "Neck",
	"Right Knee": "Right Hip",
	"Right Ankle": "Right Knee",
	"Left Hip": "Neck",
	"Left Knee": "Left Hip",
	"Left Ankle": "Left Knee",
	"Right Eye": "Nose",
	"Left Eye": "Nose",
	"Right Ear": "Right Eye",
	"Left Ear": "Left Eye",
}

export type Joint = {
	type: JointType
	point: Point
	root: Joint | null
}

export function translate(pose: Pose2d, x: number, y: number) {
	const outPose = structuredClone(pose)

	outPose.joints.forEach((j) => {
		j.point.x += x
		j.point.y += y
	})

	return outPose
}

export function move(pose: Pose2d, joint: JointType, x: number, y: number) {
	const outPose = structuredClone(pose)
	const tx = x - pose.joints[jointTypesReverse[joint]].point.x
	const ty = y - pose.joints[jointTypesReverse[joint]].point.y

	return translate(outPose, tx, ty)
}

export function getPose(pose: OpenPose | Pose2d, index = 0) {
	if (!isOpenPose(pose)) {
		return pose as Pose2d
	}
	const points = pose.people[index].pose_keypoints_2d
	console.log(`pose has ${points.length} points`)
	const p = points.map((point, i, ps) => {
		if (i % 3 === 0) {
			return { x: point, y: ps[i + 1], confidence: ps[i + 2] }
		} else return undefined
	}).filter(p => p)
	// const p = mapped.filter((p) => p && p.confidence !== 0)
	console.log(p.length)
	if (p.length !== 18) throw new Error("pose must have 18 points")

	const joints = p.map(
		(point, i) =>
			({
				type: jointTypes[i],
				point,
				root: null,
			}) as Joint,
	)

	joints.forEach((joint) => {
		const root = joints.find((j) => j.type === bodyGraph[joint.type])
		if (root) joint.root = root
	})

	return {
		neck: joints[1],

		//  1  Neck, 2  Right Shoulder, 3  Right Elbow, 4  Right Wrist
		rightArm: [joints[1], joints[2], joints[3], joints[4]],

		//  1 Neck, 5  Left Shoulder, 6  Left Elbow, 7  Left Wrist
		leftArm: [joints[1], joints[5], joints[6], joints[7]],

		// 1 Neck, 8  Right Hip, 9  Right Knee, 10 Right Ankle
		rightLeg: [joints[1], joints[8], joints[9], joints[10]],

		// 1 Neck, 11 Left Hip, 12 Left Knee, 13 Left Ankle
		leftLeg: [joints[1], joints[11], joints[12], joints[13]],

		// 1 Neck, 0 Nose, 14 Right Eye, 16 Right Ear
		rightEye: [joints[1], joints[0], joints[14], joints[16]],

		// 1 Neck, 0 Nose, 15 Left Eye, 17 Left Ear
		leftEye: [joints[1], joints[0], joints[15], joints[17]],

		joints,
	} as Pose2d
}

export function getPoses(poses: OpenPose) {
	return poses.people.map((_, i) => getPose(poses, i))
}
