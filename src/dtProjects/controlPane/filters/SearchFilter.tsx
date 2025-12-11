import { HStack, Spacer, Text, VStack } from "@chakra-ui/react"
import { FiX } from "react-icons/fi"
import { IconButton } from "@/components"
import { useSearchServiceFilter } from "@/dtProjects/state/search"
import { capitalize } from "@/utils/helpers"
import { getOperatorLabel, getValueSelector } from "./collections"
import SearchFilterForm from "./SearchFilterForm"

interface SearchFilterFormComponentProps extends Omit<ChakraProps, "filter"> {
	onRemove: () => void
	index: number
}

function SearchFilter<T>(props: SearchFilterFormComponentProps) {
	const { onRemove, index, ...boxProps } = props

	const { isEditing, target, operator, value, setIsEditing } = useSearchServiceFilter<T>(index)

	const ValueSelector = getValueSelector(target)
	const valueLabels = getLabels(value, ValueSelector)

	const incomplete = !target || !operator || !value || (Array.isArray(value) && value.length === 0)

	// const blurHandler = useRef<(e: MouseEvent) => void>(null)

	// useEffect(() => {
	// 	if (!blurHandler.current && isEditing) {
	// 		const handler = (e: MouseEvent) => {
	// 			const targetElem = e.target as HTMLElement
	// 			const insideRoot = targetElem.closest("[data-filter-root]") !== null
	// 			const insidePopup = targetElem.closest("[data-filter-popup]") !== null
	// 			const popupOpen = document.querySelector("[data-filter-popup]") !== null

	// 			if (!insideRoot && !insidePopup && !popupOpen) {
	// 				setIsEditing(false)
	// 			}
	// 		}

	// 		setTimeout(() => {
	// 			if (blurHandler.current) return
	// 			window.addEventListener("click", handler, { capture: true })
	// 			blurHandler.current = handler
	// 		}, 10)
	// 	}

	// 	return () => {
	// 		if (blurHandler.current) {
	// 			window.removeEventListener("click", blurHandler.current)
	// 			blurHandler.current = null
	// 		}
	// 	}
	// }, [isEditing, setIsEditing])

	if (isEditing) {
		return <SearchFilterForm index={index} onRemove={onRemove} />
	}

	return (
		<HStack
			outline={"4px solid purple"}
			border={"1px solid {gray/20}"}
			borderRadius={"xl"}
			// bgColor={"bg.2"}
			color={incomplete ? "fg.1/70" : "fg.1"}
			width={"100%"}
			paddingY={2}
			paddingX={2}
			onClick={(e) => {
				setIsEditing(true)
			}}
			alignItems={"stretch"}
			justifyContent={"center"}
			{...boxProps}
		>
			{incomplete ? (
				<Text fontStyle={"italic"}>Incomplete filter</Text>
			) : (
				<>
					<Text>{capitalize(target || "unset")}</Text>
					<Text>{getOperatorLabel(operator) || "?"}</Text>
					<VStack gap={0} alignItems={"flex-start"}>
						{valueLabels.map((value) => (
							<Text key={value}>{value}</Text>
						))}
					</VStack>
				</>
			)}
			<Spacer />
			<IconButton
				margin={-2}
				padding={0}
				minHeight={"unset"}
				height={"unset"}
				size={"xs"}
				onClick={onRemove}
			>
				<FiX />
			</IconButton>
		</HStack>
	)
}

export default SearchFilter

function getLabels<T>(
	value: T,
	ValueSelector: { getValueLabel: (val: T) => string | string[] },
): string[] {
	const label = ValueSelector.getValueLabel(value)
	return Array.isArray(label) ? label : [label]
}
