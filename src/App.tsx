import { Box, Button, type ButtonProps, chakra, HStack, Spacer, VStack } from "@chakra-ui/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { lazy, type PropsWithChildren, Suspense, useEffect, useRef, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { BiDetail } from "react-icons/bi"
import { useSnapshot } from "valtio"
import { Preview, useIsPreviewActive } from "@/components/preview/Preview"
import AppState from "./hooks/useAppState"
import { Loading } from "./main"
import "./menu"
import ErrorFallback from "./ErrorFallback"

const sidebarEnabled = false

function App() {
	const firstRender = useRef(true)

	const snap = useSnapshot(AppState.store)
	const View = getView(snap.currentView)

	const isPreviewActive = useIsPreviewActive()

	const [showSidebar, setShowSidebar] = useState(true)

	return (
		<HStack
			position={"relative"}
			width={"100vw"}
			height={"100vh"}
			overflow="hidden"
			alignItems={"stretch"}
			gap={0}
			bgColor={"434753"}
			transformOrigin={"left top"}
			zoom={1}
		>
			{sidebarEnabled && (
				<Button
					variant={"ghost"}
					onClick={() => setShowSidebar(true)}
					position={"absolute"}
					top={"20px"}
					left={"5px"}
					zIndex={5}
				>
					{"->"}
				</Button>
			)}
			<LayoutGroup>
				{sidebarEnabled && (
					<VStack
						inert={isPreviewActive}
						position={"absolute"}
						top={"0px"}
						bottom={"0px"}
						zIndex={5}
						overflow="clip"
						justifyContent={"flex-start"}
						paddingTop={"30px"}
						transformOrigin={"right center"}
						asChild
					>
						<motion.div
							layout={"position"}
							initial={{ width: 75, skewY: 0, rotateY: 0, left: 0 }}
							animate={
								showSidebar
									? {
											rotateY: [45, 0, 0],
											skewY: [10, 0, 0],
											left: [-68, 0, 0],
											scale: [0.95, 0.95, 1],
											backdropFilter: [1, 1, 8].map((v) => `blur(${v}px)`),
										}
									: {
											rotateY: [0, 0, 45],
											skewY: [0, 0, 10],
											left: [0, 0, -68],
											scale: [1, 0.95, 0.95],
											backdropFilter: [8, 1, 1].map((v) => `blur(${v}px)`),
										}
							}
							transition={{
								duration: 2,
								times: [0, 0.5, 1],
							}}
						>
							{sidebarItems.map((item) => (
								<SidebarItem
									key={item.viewId}
									item={item}
									isActive={snap.currentView === item.viewId}
									onClick={() => AppState.setView(item.viewId)}
								/>
							))}
							<Spacer />
							<Button variant={"ghost"} onClick={() => setShowSidebar(false)}>
								{"<-"}
							</Button>
						</motion.div>
					</VStack>
				)}
				<ErrorBoundary FallbackComponent={ErrorFallback}>
					<Suspense fallback={<Loading />}>
						<AnimatePresence>
							<ViewContainer firstRender={firstRender} inert={isPreviewActive}>
								<View
									flex={"1 1 auto"}
									boxShadow={
										"0px 0px 16px -3px #00000033, 0px 0px 8px -2px #00000022, 0px 0px 4px -1px #00000011"
									}
									borderRadius={"xl"}
								/>
							</ViewContainer>
						</AnimatePresence>
					</Suspense>
				</ErrorBoundary>
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
			inert={inert}
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.95 }}
			style={{ width: "100%", height: "100%", display: "flex" }}
		>
			{children}
		</motion.div>
	)
}

const SidebarButton = chakra("button", {
	base: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		transition: "all 0.2s ease-in-out",
		fontSize: "xs",
		width: "100%",
		borderRight: "2px solid transparent",
		color: "fg.3",
	},
	variants: {
		isActive: {
			true: {
				color: "highlight",
			},
		},
	},
})

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
	{ viewId: "scratch", label: "Scratch", icon: BiDetail },
]

interface SidebarButtonProps extends ButtonProps {
	item: (typeof sidebarItems)[number]
	isActive: boolean
	onClick: () => void
}

function SidebarItem(props: SidebarButtonProps) {
	const { item, isActive, onClick, ...rest } = props
	const { label, icon: Icon } = item
	return (
		<Box
			position={"relative"}
			width={"100%"}
			// paddingRight={"5px"}
			borderInline={"3px solid transparent"}
			borderRightColor={isActive ? "highlight" : "transparent"}
			borderRadius={"xs"}
		>
			<SidebarButton isActive={isActive} onClick={onClick} {...rest}>
				<Box width={"35px"} height={"35px"} padding={2} aspectRatio={1} asChild>
					<Icon />
				</Box>
				<Box fontSize={"10px"} fontWeight={"500"}>
					{label}
				</Box>
			</SidebarButton>
		</Box>
	)
}

const views = {
	metadata: lazy(() => import("./metadata/MetadataContainer")),
	mini: lazy(() => import("./Mini")),
	vid: lazy(() => import("./vid/Vid")),
	library: lazy(() => import("./library/Library")),
	scratch: lazy(() => import("./dtProjects/DTProjects")),
}

function getView(view: string) {
	if (isView(view)) return views[view]
	return views.metadata
}

function isView(view: string): view is keyof typeof views {
	return view in views
}

export default App
