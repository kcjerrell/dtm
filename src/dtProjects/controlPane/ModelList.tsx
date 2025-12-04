import { Model } from "@/commands"
import { IconButton, PanelListItem } from "@/components"
import PanelList from "@/components/PanelList"
import { makeSelectableList, Selectable, useSelectable } from "@/hooks/useSelectableV"
import { useProxyRef, useSubscribeValue } from "@/hooks/valtioHooks"
import { Button, HStack, Input, Popover, Portal, Text, VStack } from "@chakra-ui/react"
import type { ChakraProps } from "app/types"
import { useEffect, useState } from "react"
import { LuChevronDown } from "react-icons/lu"
import { TbSortAscendingLetters, TbSortDescendingNumbers } from "react-icons/tb"
import { Snapshot } from "valtio"

interface ListBoxComponentProps extends ChakraProps {
	items: Snapshot<Model[]>
	label: string
	value: Snapshot<Model[]>
	onChange: (selected: Model[]) => void
}
let renderCount = 0
function ModelsListBox(props: ListBoxComponentProps) {
	const { items, label, value, onChange, ...boxProps } = props
	console.log(renderCount++)
	const [inputValue, setInputValue] = useState("")
	const { state, snap } = useProxyRef(() => ({
		filterFn: (() => true) as (model: Model) => boolean,
		sortType: "name" as "name" | "count",
		isOpen: false,
		sorted: [] as Selectable<Model>[],
	}))

	useEffect(() => {
		state.sorted = getSorted(items, state.sortType)
	}, [items, state])

	useSubscribeValue(state, "sortType", () => {
		state.sorted = getSorted(items, state.sortType)
	})

	return (
		<VStack>
			{value.length > 0 && <Text>{value.map((model) => model.name).join(", ")}</Text>}
			<Popover.Root
				positioning={{ sameWidth: true, placement: "bottom" }}
				open={snap.isOpen}
				// positioning={{sameWidth: false, placement: "bottom"}}
				onOpenChange={(e) => {
					state.isOpen = e.open
				}}
			>
				<Popover.Trigger asChild>
					<Button size="sm" variant="outline">
						{label} <LuChevronDown />
					</Button>
				</Popover.Trigger>

				<Portal>
					<Popover.Positioner bgColor={"red"}>
						<Popover.Content
							padding={0}
							margin={0}
							bgColor={"transparent"}
							overflowY="auto"
							maxH="20rem"
							width={"30rem"}
							_closed={{ animation: "none" }}
							scrollbarGutter="stable"
							// scrollbarWidth="thin"
							_scrollbar={{
								bgColor: "bg.1",
								width: "8px",
							}}
							_scrollbarThumb={{
								bgColor: "bg.2",
							}}
						>
							<Popover.Body
								width={"100%"}
								margin={0}
								padding={0}
								display={"flex"}
								flexDirection={"column"}
								alignItems={"stretch"}
							>
								<HStack justifyContent={"space-between"}>
									<Input
										flex={"1 1 auto"}
										key={"modelInput"}
										placeholder="Filter"
										value={inputValue}
										onChange={(e) => {
											setInputValue(e.target.value)
											state.filterFn = buildModelFilter(e.target.value)
										}}
										variant="flushed"
									/>
									{snap.sortType === "name" ? (
										<IconButton
											onClick={() => {
												state.sortType = "count"
											}}
										>
											<TbSortAscendingLetters />
										</IconButton>
									) : (
										<IconButton
											onClick={() => {
												state.sortType = "name"
											}}
										>
											<TbSortDescendingNumbers />
										</IconButton>
									)}
								</HStack>
								<PanelList
									itemsState={() => state.sorted}
									keyFn={(item) => item.id}
									onSelectionChanged={(selected) => {
										onChange(selected)
									}}
								>
									{snap.sorted.map((model) => (
										<ModelItem key={model.id} model={model} filterFn={state.filterFn} />
									))}
								</PanelList>
							</Popover.Body>
						</Popover.Content>
					</Popover.Positioner>
				</Portal>
			</Popover.Root>
		</VStack>
	)
}

export default ModelsListBox

function getModelLabel(model: Model, noVersion?: boolean) {
	if (model.name && model.version && !noVersion) return `${model.name} (${model.version})`
	if (model.name) return model.name
	return model.filename
}

function sortByName(a: Model, b: Model) {
	return getModelLabel(a).localeCompare(getModelLabel(b))
}

function sortByCount(a: Model, b: Model) {
	return b.count - a.count
}

function getSorted(items: MaybeReadonly<Model[]>, sortType: "name" | "count") {
	if (sortType === "name") return makeSelectableList(items.toSorted(sortByName))
	return makeSelectableList(items.toSorted(sortByCount))
}

function ModelItem(props: { model: Selectable<Model>; filterFn?: (m: Model) => boolean }) {
	const { model, filterFn, ...restProps } = props
	const { isSelected, handlers } = useSelectable(model)
	if (filterFn && !filterFn(model)) return null
	return (
		<PanelListItem key={model.id} selectable selected={isSelected} {...restProps} {...handlers}>
			<Text textOverflow="ellipsis" textWrap={"nowrap"} overflowX="hidden">
				{getModelLabel(model, true)}
			</Text>
			<Text>
				{model.count} {model.version}
			</Text>
		</PanelListItem>
	)
}

export function buildModelFilter(query: string): (m: Model) => boolean {
	const tokens = tokenize(query)

	const matchers = tokens.map((token) => {
		const countMatch = token.match(/^count\s*(<=|>=|=|<|>)\s*(\d+)$/i)
		if (countMatch) {
			const [, op, numStr] = countMatch
			const value = Number(numStr)

			return (m: Model) => {
				switch (op) {
					case ">":
						return m.count > value
					case "<":
						return m.count < value
					case ">=":
						return m.count >= value
					case "<=":
						return m.count <= value
					case "=":
						return m.count === value
					default:
						return false
				}
			}
		}

		const lower = token.toLowerCase()
		return (m: Model) =>
			m.filename.toLowerCase().includes(lower) ||
			m.name?.toLowerCase().includes(lower) ||
			m.version?.toLowerCase().includes(lower)
	})

	return (m: Model) => matchers.some((fn) => fn(m))
}

function tokenize(text: string): string[] {
	const result: string[] = []
	const regex = /"([^"]*)"|[^,\s]+/g

	let match: RegExpExecArray | null
	while ((match = regex.exec(text)) !== null) {
		if (match[1] !== undefined) result.push(match[1])
		else result.push(match[0])
	}
	return result
}
