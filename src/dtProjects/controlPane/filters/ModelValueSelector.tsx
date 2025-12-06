import { Box, HStack, Input, Text, VStack } from "@chakra-ui/react"
import { type ComponentProps, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { TbSortAscendingLetters, TbSortDescendingNumbers } from "react-icons/tb"
import { useSnapshot } from "valtio"
import type { Model } from "@/commands"
import { IconButton, PaneListContainer, PanelListItem } from "@/components"
import { PaneListScrollContainer, PanelListScrollContent } from "@/components/common"
import PanelList from "@/components/PanelList"
import { type DTProjectsStateType, useDTProjects } from "@/dtProjects/state/projectStore"
import { makeSelectableList, type Selectable, useSelectable } from "@/hooks/useSelectableV"
import { useProxyRef, useSubscribeValue } from "@/hooks/valtioHooks"
import { filterObject } from "@/utils/helpers"
import { getVersionLabel } from "@/utils/models"
import type { FilterValueSelector, ValueSelectorProps } from "./collections"

function ModelValueSelectorComponent(
	props: ValueSelectorProps<Model[]> & { modelType?: "models" | "loras" | "controls" },
) {
	const { value, onValueChange, modelType = "models", ...boxProps } = props

	const { state: dtpState } = useDTProjects()
	const models = dtpState.models
	const modelsSnap = useSnapshot(models)

	const [inputValue, setInputValue] = useState("")
	const { state, snap } = useProxyRef(() => ({
		sortType: "count" as "name" | "count",
		isOpen: false,
		sorted: [] as Selectable<Model>[],
		versions: [] as [string, { models: number; loras: number; controls: number; label: string }][],
		selectedVersion: undefined as string | undefined,
	}))

	useEffect(() => {
		state.sorted = getSorted(modelsSnap[modelType], state.sortType)
		state.versions = getVersions(dtpState.models, modelType)
	}, [modelsSnap[modelType], state, modelType, dtpState.models])

	useSubscribeValue(state, "sortType", () => {
		state.sorted = getSorted(modelsSnap[modelType], state.sortType)
	})

	const checkRoot = document.getElementById("check-root")
	if (!checkRoot) return null

	return (
		<Box padding={0} {...boxProps}>
			<Box
				width={"full"}
				padding={2}
				minHeight={"min-content"}
				border={"none"}
				outline={"none"}
				onClick={() => {
					state.isOpen = true
				}}
			>
				<VStack width={"full"} alignItems={"stretch"}>
					{value && value.length > 0 ? (
						value.map((model) => <Text key={model.filename}>{getModelLabel(model)}</Text>)
					) : (
						<Text key="empty" opacity={0.7} fontStyle={"italic"}>
							(Select a model...)
						</Text>
					)}
				</VStack>
			</Box>
			{snap.isOpen &&
				createPortal(
					<HStack
						alignItems={"flex-start"}
						justifyContent={"stretch"}
						ref={(elem) => {
							if (!elem) return
							const handler = (e: MouseEvent) => {
								const insidePopup =
									(e.target as HTMLElement).closest("[data-filter-popup]") !== null
								if (insidePopup) return
								// e.stopPropagation()
								state.isOpen = false
							}
							window.addEventListener("click", handler, { capture: true })
							return () => {
								window.removeEventListener("click", handler, { capture: true })
							}
						}}
						data-filter-popup
						position={"absolute"}
						top={"10vh"}
						height={"80vh"}
						left={"25rem"}
						width={"calc(100% - 30rem)"}
						maxWidth={"35rem"}
						minWidth={"20rem"}
						overflow={"clip"}
						fontSize={"sm"}
						bgColor={"bg.1"}
						boxShadow={"pane1"}
					>
						<VStack
							flex={"1 1 auto"}
							paddingTop={2}
							overflow={"clip"}
							height={"full"}
							alignItems={"stretch"}
						>
							<HStack width={"full"} justifyContent={"space-between"} paddingX={2}>
								<Input
									flex={"1 1 auto"}
									key={"modelInput"}
									placeholder="Filter"
									value={inputValue}
									onChange={(e) => {
										setInputValue(e.target.value)
									}}
									variant="subtle"
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
								key={`${snap.selectedVersion ?? "model"}_list`}
								flex={"1 1 auto"}
								itemsState={() => state.sorted}
								keyFn={(item) => item.id}
								onSelectionChanged={(selected) => {
									onValueChange?.(selected)
								}}
								overflowY={"auto"}
								overflowX={"clip"}
								maxHeight={"100%"}
								selectionMode="multipleToggle"
							>
								{snap.sorted.map((model) => (
									<ModelItem
										key={model.id}
										model={model}
										filterText={inputValue}
										filterVersion={snap.selectedVersion}
									/>
								))}
							</PanelList>
						</VStack>
						<PaneListContainer
							flex={"0 0 auto"}
							maxHeight={"full"}
							overflowY={"clip"}
							height={"min-content"}
							width={"max-content"}
						>
							<PaneListScrollContainer>
								<PanelListScrollContent>
									{snap.versions.map(([version, info]) => (
										<PanelListItem
											width={"full"}
											key={version}
											selectable
											selected={version === snap.selectedVersion}
											onClick={() => {
												if (state.selectedVersion === version) state.selectedVersion = undefined
												else state.selectedVersion = version
											}}
										>
											<Text>{info.label}</Text>
											<Text>{info[modelType]} models</Text>
										</PanelListItem>
									))}
								</PanelListScrollContent>
							</PaneListScrollContainer>
						</PaneListContainer>
					</HStack>,
					checkRoot,
				)}
		</Box>
	)
}

function ModelItem(props: {
	model: Selectable<Model>
	filterText?: string
	filterVersion?: string
}) {
	const { model, filterText, filterVersion, ...restProps } = props
	const { isSelected, handlers } = useSelectable(model)

	if (filterText) {
		const modelText = `${model.filename} ${model.name} ${model.version}`.toLowerCase()
		if (!modelText.includes(filterText.toLowerCase())) return null
	}

	if (filterVersion !== undefined) {
		if ((model.version ?? "") !== filterVersion) return null
	}

	return (
		<PanelListItem key={model.id} selectable selected={isSelected} {...restProps} {...handlers}>
			<Text textOverflow="ellipsis" textWrap={"nowrap"} overflowX="hidden">
				{getModelLabel(model, true)}
			</Text>
			<HStack justifyContent={"space-between"}>
				<Text>{model.count} images</Text>
				<Text>{getVersionLabel(model.version)}</Text>
			</HStack>
		</PanelListItem>
	)
}

function getModelLabel(model?: Model, noVersion?: boolean) {
	if (!model) return ""
	if (model.name && model.version && !noVersion) return `${model.name} (${model.version})`
	if (model.name) return model.name
	return model.filename
}

function getModelLabels(models?: Model[], noVersion?: boolean) {
	return models?.map((model) => getModelLabel(model, noVersion)) ?? []
}

function sortByName(a: Model, b: Model) {
	return getModelLabel(a).localeCompare(getModelLabel(b))
}

function sortByCount(a: Model, b: Model) {
	return (b.count ?? 0) - (a.count ?? 0)
}

function getSorted(items: MaybeReadonly<Model[]>, sortType: "name" | "count") {
	if (sortType === "name") return makeSelectableList(items.toSorted(sortByName))
	return makeSelectableList(items.toSorted(sortByCount))
}

function getVersions(
	models: DTProjectsStateType["models"],
	modelType: "models" | "loras" | "controls",
) {
	const versions = filterObject(models.versions, (_, counts) => counts[modelType] > 0)
	return Object.entries(versions).sort((b, a) => {
		if (a[0] === "") return -1
		if (b[0] === "") return 1
		return a[1][modelType] - b[1][modelType]
	})
}

export const ModelValueSelector = ModelValueSelectorComponent as FilterValueSelector<Model[]>
ModelValueSelector.getValueLabel = getModelLabels

const LoraValueSelectorComponent = (props: ComponentProps<typeof ModelValueSelectorComponent>) =>
	ModelValueSelectorComponent({ ...props, modelType: "loras" })
export const LoraValueSelector = LoraValueSelectorComponent as FilterValueSelector<Model[]>
LoraValueSelector.getValueLabel = getModelLabels

const ControlValueSelectorComponent = (props: ComponentProps<typeof ModelValueSelectorComponent>) =>
	ModelValueSelectorComponent({ ...props, modelType: "controls" })
export const ControlValueSelector = ControlValueSelectorComponent as FilterValueSelector<Model[]>
ControlValueSelector.getValueLabel = getModelLabels

export function buildModelFilter(query: string): (m: Model) => boolean {
	const tokens = tokenize(query)

	const matchers = tokens.map((token) => {
		const countMatch = token.match(/^(<=|>=|=|<|>)(\d+)$/i)
		if (countMatch) {
			const [, op, numStr] = countMatch
			const value = Number(numStr)

			return (m: Model) => {
				const count = m.count ?? 0
				switch (op) {
					case ">":
						return count > value
					case "<":
						return count < value
					case ">=":
						return count >= value
					case "<=":
						return count <= value
					case "=":
						return count === value
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

	if (matchers.length === 0) return () => true
	return (m: Model) => matchers.some((fn) => fn(m))
}

function tokenize(text: string): string[] {
	const result: string[] = []
	const regex = /"([^"]*)"|[^,\s]+/g

	let match: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: match iteration
	while ((match = regex.exec(text)) !== null) {
		if (match[1] !== undefined) result.push(match[1])
		else result.push(match[0])
	}
	return result
}
