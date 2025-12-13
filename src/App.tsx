import { HStack, IconButton, Spacer, VStack } from "@chakra-ui/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { lazy, type PropsWithChildren, Suspense, useEffect, useRef } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { BiDetail } from "react-icons/bi"
import { FaMinus, FaMoon, FaPlus } from "react-icons/fa6"
import { useSnapshot } from "valtio"
import { CheckRoot, Sidebar, Tooltip } from "@/components"
import { Preview, useIsPreviewActive } from "@/components/preview"
import { themeHelpers } from "@/theme/helpers"
import { toggleColorMode, useColorMode } from "./components/ui/color-mode"
import ErrorFallback from "./ErrorFallback"
import AppStore from "./hooks/appState"
import { Loading } from "./main"
import "./menu"
import UpgradeButton from "./metadata/toolbar/UpgradeButton"
import Onboard from "./Onboard"

function App() {
	const firstRender = useRef(true)

	const snap = useSnapshot(AppStore.store)
	const View = getView(snap.currentView)

	const isPreviewActive = useIsPreviewActive()
	const { colorMode } = useColorMode()

	return (
		<HStack
			position={"relative"}
			width={"100vw"}
			height={"100vh"}
			overflow="hidden"
			alignItems={"stretch"}
			justifyContent={"stretch"}
			gap={0}
			bgColor={"check.2"}
			transformOrigin={"left top"}
			onPointerDownCapture={async (e) => {
				if (e.clientY < 50) {
					const win = await getCurrentWindow()
					win.startDragging()
				}
			}}
		>
			<LayoutGroup>
				<Sidebar inert={isPreviewActive}>
					{sidebarItems.map((item) => (
						<Sidebar.Button
							key={item.viewId}
							label={item.label}
							icon={item.icon}
							isActive={snap.currentView === item.viewId}
							onClick={() => AppStore.setView(item.viewId)}
						/>
					))}
					<UpgradeButton marginTop={4} />
					<Spacer />
					<VStack gap={0} pb={2}>
						<Tooltip tip={"Toggle color mode"}>
							<IconButton
								color={"fg.2"}
								_hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
								size="xs"
								variant="ghost"
								onClick={(e) => {
									e.stopPropagation()
									toggleColorMode()
								}}
							>
								<FaMoon />
							</IconButton>
						</Tooltip>
						<HStack gap={0}>
							<Tooltip tip={"Decrease font size"}>
								<IconButton
									color={"fg.2"}
									_hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
									size="xs"
									variant="ghost"
									onClick={(e) => {
										e.stopPropagation()
										themeHelpers.decreaseSize()
									}}
								>
									<FaMinus />
								</IconButton>
							</Tooltip>
							<Tooltip tip={"Increase font size"}>
								<IconButton
									color={"fg.2"}
									_hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
									size="xs"
									variant="ghost"
									onClick={(e) => {
										e.stopPropagation()
										themeHelpers.increaseSize()
									}}
								>
									<FaPlus />
								</IconButton>
							</Tooltip>
						</HStack>
					</VStack>
				</Sidebar>
				<CheckRoot id={"check-root"} dark={colorMode === "dark"}>
					<ErrorBoundary FallbackComponent={ErrorFallback}>
						<Suspense fallback={<Loading />}>
							<AnimatePresence mode={"wait"}>
								<ViewContainer
									key={snap.currentView}
									firstRender={firstRender}
									inert={isPreviewActive}
								>
									<View flex={"1 1 auto"} />
								</ViewContainer>
							</AnimatePresence>
						</Suspense>
					</ErrorBoundary>
					{snap.onboardPhase?.startsWith("A") && <Onboard />}
				</CheckRoot>
			</LayoutGroup>
			<Preview />
		</HStack>
	)
}

function ViewContainer(
	props: PropsWithChildren<{ firstRender: { current: boolean }; inert?: boolean }>,
) {
	const { firstRender, children, inert } = props

	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false
			getCurrentWindow().show().catch(console.error)
		}
	}, [firstRender])

	return (
		<motion.div
			layout
			inert={inert}
			initial={{ opacity: 0, scale: 1, filter: "blur(0px)" }}
			animate={{
				opacity: 1,
				scale: 1,
				filter: "blur(0px)",
				transition: { duration: 0.1 },
			}}
			exit={{
				opacity: 0,
				scale: 1,
				filter: "blur(0px)",
				transition: { duration: 0.2 },
			}}
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flex: "1 1 auto",
				overflow: "clip",
				justifyContent: "stretch",
				alignItems: "stretch",
				// paddingBlock: "4px",
				boxShadow: "0px 2px 4px -2px #00000099",
			}}
		>
			{children}
		</motion.div>
	)
}

const sidebarItems = [
	{
		viewId: "metadata",
		label: "Metadata",
		icon: BiDetail,
	},
	{
		viewId: "vid",
		label: "Video",
		icon: BiDetail,
	},
	{
		viewId: "library",
		label: "Library",
		icon: BiDetail,
	},
	{ viewId: "projects", label: "Projects", icon: BiDetail },
	{ viewId: "scratch", label: "Scratch", icon: BiDetail },
]

const views = {
	metadata: lazy(() => import("./metadata/Metadata")),
	mini: lazy(() => import("./Mini")),
	vid: lazy(() => import("./vid/Vid")),
	library: lazy(() => import("./library/Library")),
	projects: lazy(() => import("./dtProjects/DTProjectsContainer")),
	scratch: lazy(() => import("./scratch/Scratch6")),
}

function getView(view: string) {
	if (isView(view)) return views[view]
	return views.metadata
}

function isView(view: string): view is keyof typeof views {
	return view in views
}

export default App
