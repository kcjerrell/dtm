import { Box } from "@chakra-ui/react"
import { AnimatePresence } from "motion/react"
import type { ComponentProps } from "react"
import { FiX } from "react-icons/fi"
import { IconButton, MotionBox } from "@/components"
import { useDTProjects } from "@/dtProjects/state/projectStore"
import { useUiState } from "@/metadata/state/uiState"

const dur = 0.2

interface SearchIndicatorProps extends ComponentProps<typeof MotionBox> {}

function SearchIndicator(props: SearchIndicatorProps) {
	const { ...boxProps } = props

	const { snap, store } = useDTProjects()
	const { uiSnap } = useUiState()

	return (
		<AnimatePresence>
			{uiSnap.selectedTab === "projects" && (
				<MotionBox
					display={"flex"}
					className={"group"}
					gap={0}
					padding={0}
					borderRadius={"0px 1rem 1rem 0rem"}
					{...boxProps}
					initial={{ boxShadow: "0px 1px 4px -1px #00000000, 0px 4px 16px -4px #00000000" }}
					animate={{ boxShadow: "0px 1px 4px -1px #00000055, 0px 4px 16px -4px #00000055" }}
					layout={true}
					layoutId="search-indicator"
					transition={{ duration: dur, ease: "easeInOut" }}
				>
					<MotionBox
						paddingY={1}
						paddingX={2}
						bgColor={"bg.3"}
						fontStyle={"italic"}
						zIndex={1}
						layout={true}
						initial={{
							borderRadius: "0.5rem 0.5rem 0.5rem 0.5rem",
							border: "1px solid #77777700",
						}}
						animate={{
							borderRadius: "0.5rem 0.75rem 0.75rem 0.5rem",
							border: "1px solid #777777FF",
						}}
						transition={{ duration: dur }}
						style={{}}
					>
						"{snap.imageSource.search}"
					</MotionBox>
					<MotionBox
						borderRadius={"0px 1rem 1rem 0rem"}
						border={"1px solid #777777"}
						position={"relative"}
						boxShadow={"pane1"}
						color={"fg.3"}
						bgColor={"bg.deep"}
						paddingY={1}
						paddingLeft={3}
						paddingRight={2}
						marginLeft={"-2"}
						// _groupHover={{ opacity: 0 }}
						// layout={true}
						initial={{ x: "-100%", scaleX: 0, visibility: "collapsed" }}
						animate={{
							x: "0%",
							scaleX: 1,
							visibility: "visible",
						}}
						style={{ overflow: "clip" }}
						transition={{
							duration: dur,
							delay: dur * 0.8,
							visibility: { duration: 0, delay: dur * 0.8 },
						}}
					>
						<Box
							position={"absolute"}
							zIndex={2}
							left={3}
							top={0}
							bottom={0}
							right={0}
							margin={"auto"}
							opacity={1}
							_groupHover={{ opacity: 0 }}
							alignContent={"center"}
						>
							+{snap.imageSource.filters?.length ?? 0}
						</Box>
						<IconButton
							color={"fg.1"}
							position={"absolute"}
							zIndex={3}
							left={1}
							top={0}
							bottom={0}
							right={1}
							// flex={"0 0 auto"}
							// margin={-2}
							// marginLeft="auto"
							// marginRight={-2}
							padding={0}
							minHeight={"unset"}
							height={"full"}
							size={"xs"}
							// visibility={"collapsed"}
							opacity={0}
							_groupHover={{ opacity: 1 }}
							onClick={() => {
								store.setSearchFilter()
							}}
						>
							<FiX />
						</IconButton>
						<Box visibility={"hidden"}>+X</Box>
					</MotionBox>
				</MotionBox>
			)}
		</AnimatePresence>
	)
}

export default SearchIndicator
