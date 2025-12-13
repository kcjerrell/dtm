import { Box, Button } from "@chakra-ui/react"
import { AnimatePresence } from "motion/react"
import type { ComponentProps } from 'react'
import { type Snapshot, useSnapshot } from "valtio"
import { MotionBox } from "./components"
import { usePDB } from './dtProjects/state/context'
import { useDTProjects } from "./dtProjects/state/projectStore"
import AppStore from "./hooks/appState"
import type { UIStateType } from './metadata/state/uiState'

interface OnboardComponentProps extends ComponentProps<typeof MotionBox> {}

function Onboard(props: OnboardComponentProps) {
	const { ...boxProps } = props
	const appSnap = useSnapshot(AppStore.store)
	const { snap: dtpSnap } = useDTProjects()
	
	const { uiState } = usePDB()
	const uiSnap = uiState.useSnap()

	const combinedSnap: CombinedSnap = {
		appSnap,
		uiSnap,
		dtpSnap,
	}

	const stage = stages[combinedSnap.appSnap.onboardPhase as keyof typeof stages]

	if (!stage) return null
	if (stage?.check(combinedSnap)) {
		AppStore.store.onboardPhase = stage.next
	}

	return (
		<AnimatePresence>
			<MotionBox
				display={"flex"}
				flexDirection={"column"}
				alignItems={"center"}
				key={combinedSnap.appSnap.onboardPhase ?? "onboard"}
				position={"absolute"}
				bottom={stage?.bottom}
				top={stage?.top}
				left={stage?.left}
				color={"fg.1"}
				bgColor={"bg.0"}
				maxWidth={"18rem"}
				padding={1}
				boxShadow={"pane0"}
				border={"1px solid gray"}
				borderRadius={"md"}
				overflow={"clip"}
				whiteSpace={"preserve-breaks"}
				// transition={"all 0.3s ease-in-out"}
				// layout
				initial={{ opacity: 0 }}
				exit={{ opacity: 0 }}
				animate={{
					y: [-3, 3, -3],
					opacity: 1,
				}}
				transition={{
					y: {
						duration: 3,
						repeat: Infinity,
						ease: ["easeInOut", "easeInOut"],
						repeatType: "loop",
					},
				}}
				{...boxProps}
			>
				<Box padding={2}>{stage?.text}</Box>
				<Button unstyled asChild onClick={() => {
					AppStore.store.onboardPhase = "B0"
				}}>
					<Box alignSelf={"flex-end"} fontSize={"xs"} _hover={{ textDecoration: "underline" }} cursor={"pointer"}>
						Dismiss
					</Box>
				</Button>
			</MotionBox>
		</AnimatePresence>
	)
}

type CombinedSnap = {
	appSnap: Snapshot<typeof AppStore.store>
	uiSnap: Snapshot<UIStateType>
	dtpSnap: ReturnType<typeof useDTProjects>["snap"]
}

const stages = {
	A1: {
		text: "Uh... there's something hiding over here. Can you click it?",
		left: "0.5rem",
		bottom: "8rem",
		next: "A2",
		top: "unset",
		check: (snap: CombinedSnap) => {
			return snap.appSnap.isSidebarVisible
		},
	},
	A2: {
		text: "Great, now there's a sidebar crowding my view. I hope I can hide it again. \nHey wait, what's this Projects thing?",
		left: "0.5rem",
		top: "8rem",
		bottom: "unset",
		next: "A3",
		check: (snap: CombinedSnap) => {
			return snap.appSnap.currentView === "projects"
		},
	},
	A3: {
		text: "Wow, there's like nothing here. Maybe I should check out the settings?",
		left: "calc(50% - 9rem)",
		top: "8rem",
		bottom: "unset",
		next: "A4",
		check: (snap: CombinedSnap) => {
			return snap.appSnap.currentView === "projects" && snap.uiSnap.selectedTab === "settings"
		},
	},
	A4: {
		text: "Maybe I should try those 'default location' buttons and see what happens?",
		left: "calc(50% - 9rem)",
		top: "8rem",
		bottom: "unset",
		next: "A5",
		check: (snap: CombinedSnap) => {
			return snap.dtpSnap.watchFolders.projectFolders.length > 0
		},
	},
	A5: {
		text: "I think something happened. Let's go back to projects...",
		left: "calc(50% - 9rem)",
		top: "8rem",
		bottom: "unset",
		next: "B0",
		check: (snap: CombinedSnap) => {
			return snap.appSnap.currentView === "projects" && snap.uiSnap.selectedTab === "projects"
		},
	},
}

export default Onboard
