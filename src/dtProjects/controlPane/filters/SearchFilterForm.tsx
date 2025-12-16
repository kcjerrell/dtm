import { Grid } from "@chakra-ui/react"
import { useRef } from "react"
import { FiX } from "react-icons/fi"
import { IconButton } from "@/components"
import { useDTP } from "@/dtProjects/state/context"
import type { FilterOperator } from "@/dtProjects/state/search"
import FilterSelect from "./FilterSelect"

interface SearchFilterFormComponentProps extends Omit<ChakraProps, "filter"> {
	onRemove: () => void
	index: number
}

const selectStyle = {
	// bgColor: "bg.3",
	color: "fg.2",
	_hover: {
		bgColor: "bg.0",
		transition: "all 0.05s ease-out",
	},
} as const

function SearchFilterForm<T>(props: SearchFilterFormComponentProps) {
	const { onRemove, index, ...boxProps } = props
	const { search } = useDTP()
	const {
		target,
		operator,
		value,
		ValueSelector,
		setValue,
		setOperator,
		setTarget,
		targetCollection,
		operatorCollection,
	} = search.useSearchFilter<T>(index)
	const { valueColumn, valueRow, removeColumn, templateColumns } = getLayout(target)

	const targetRef = useRef<HTMLDivElement>(null)

	return (
		<Grid
			data-filter-root={index}
			// bgColor={"bg.deep"}
			color={"fg.2"}
			bgColor={"bg.3"}
			borderRadius={"sm"}
			boxShadow={"0px 0px 18px -8px #00000022"}
			width={"100%"}
			paddingY={0}
			gap={0}
			justifyContent={"stretch"}
			alignItems={"stretch"}
			gridTemplateColumns={templateColumns}
			overflow={"clip"}
			onClick={(e) => {
				if (e.target !== e.currentTarget) return
				if (!target && !!targetRef.current)
					(targetRef.current?.querySelector("[data-part=trigger]") as HTMLElement)?.click()
			}}
			{...boxProps}
		>
			<FilterSelect
				ref={targetRef}
				placeholder={"Select"}
				collection={targetCollection}
				value={target ? [target] : undefined}
				gridColumn={"1"}
				gridRow={"1"}
				{...selectStyle}
				onValueChange={(value) => {
					setTarget(value.value[0])
				}}
			/>
			<FilterSelect
				disabled={!target}
				placeholder={"?"}
				collection={operatorCollection}
				value={operator ? [operator] : undefined}
				pointerEvents={!target ? "none" : "auto"}
				gridColumn={"2"}
				gridRow={"1"}
				{...selectStyle}
				onValueChange={(v) => {
					setOperator(v.value[0] as FilterOperator)
				}}
				plural={false}
			/>
			<ValueSelector
				key={`${target}_value`}
				value={value}
				target={target}
				// this disables the hover style if no target is selected
				// lazy disabled :)
				pointerEvents={!target ? "none" : "auto"}
				flex={"1 1 auto"}
				gridColumn={valueColumn}
				gridRow={valueRow}
				{...selectStyle}
				onValueChange={(v: T | undefined) => {
					setValue(v)
				}}
			/>

			<IconButton
				color={"fg.1"}
				// bgColor={"bg.deep/50"}
				_hover={{ bgColor: "bg.2" }}
				gridColumn={removeColumn}
				size={"xs"}
				onClick={onRemove}
				width={"min-content"}
				height={"min-content"}
				padding={0}
			>
				<FiX />
			</IconButton>
		</Grid>
	)
}

function getLayout(target?: string) {
	if (target && ["model", "lora", "control", "refiner"].includes(target)) {
		return {
			valueColumn: "1 / 4",
			valueRow: "2",
			removeColumn: "3",
			templateColumns: "1fr 1fr min-content",
		}
	}
	return {
		valueColumn: "3",
		valueRow: "1",
		removeColumn: "4",
		templateColumns: "max-content max-content 1fr min-content",
	}
}

export default SearchFilterForm
