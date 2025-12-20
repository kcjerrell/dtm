import { Flex, useTabsContext } from "@chakra-ui/react"
import { useEffect, useRef } from "react"
import Tabs from "./tabs"

interface TabContentProps extends ChakraProps {
	updateScroll?: (tab: string, scrollPos: number) => void
	scrollPos?: number
	value?: string
	contentProps?: ChakraProps
}

const TabContent = (props: TabContentProps) => {
	const { updateScroll, scrollPos, children, value, contentProps, ...rest } = props
	const cv = useTabsContext()

	const scrollRef = useRef<HTMLDivElement>(null)
	const scrollContentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!scrollRef.current || !scrollContentRef.current) return

		const resizeObserver = new ResizeObserver((entries) => {
			if (!scrollRef.current) return
			const entry = entries.find((e) => e.target === scrollContentRef.current)
			if (!entry) return
			scrollRef.current.scrollTop = scrollPos ?? 0
		})
		resizeObserver.observe(scrollContentRef.current)

		return () => resizeObserver.disconnect()
	}, [scrollPos])

	if (value !== cv.value) return null

	return (
		<Tabs.Content
			className="hide-scrollbar"
			ref={scrollRef}
			value={value}
			minH={0}
			fontSize="sm"
			overflowY="auto"
			overscrollBehavior={"contain"}
			onScroll={(e) => updateScroll?.(value, e.currentTarget.scrollTop)}
			width={"100%"}
			height={"auto"}
			{...rest}
		>
			<Flex flex={"1 1 auto"} width={"full"} flexDir={"column"} ref={scrollContentRef} {...contentProps}>{children}</Flex>
		</Tabs.Content>
	)
}

export default TabContent
