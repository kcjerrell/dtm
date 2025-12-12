import { Box, HStack, Input, Text, VStack } from "@chakra-ui/react"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FiX } from "react-icons/fi"
import { TbSortAscendingLetters, TbSortDescendingNumbers } from "react-icons/tb"
import { useSnapshot } from "valtio"
import type { Model } from "@/commands"
import { IconButton, PaneListContainer, PanelListItem } from "@/components"
import { PaneListScrollContainer, PanelListScrollContent } from "@/components/common"
import PanelList from "@/components/PanelList"
import { type DTProjectsStateType, useDTProjects } from "@/dtProjects/state/projectStore"
import { isVersionModel, type VersionModel } from "@/dtProjects/types"
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

	const filterFn = buildModelFilter(inputValue, snap.selectedVersion)

	useEffect(() => {
		if (!modelsSnap[modelType]) return
		state.sorted = getSorted(models[modelType], state.sortType)
		state.versions = getVersions(models, modelType)
	}, [models[modelType], state, modelType, modelsSnap[modelType]])

	useSubscribeValue(state, "sortType", () => {
		state.sorted = getSorted(models[modelType], state.sortType)
	})

	useEffect(() => {
		const selectedIds = new Set(value?.map((v) => v.id))
		state.sorted.forEach((item) => {
			if (item.selected !== selectedIds.has(item.id)) {
				item.setSelected(selectedIds.has(item.id))
			}
		})
	}, [value, state.sorted])

	const containerRef = useRef<HTMLDivElement>(null)

	const checkRoot = document.getElementById("check-root")
	if (!checkRoot) return null

	return (
		<Box padding={0} {...boxProps} ref={containerRef}>
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
				<VStack width={"full"} alignItems={"stretch"} overflowX={"clip"}>
					{value && value.length > 0 ? (
						value.map((model) => (
							<HStack width={"full"} className={"group"} key={model.filename}>
								<Text
									flex={"1 1 auto"}
									textWrap={"nowrap"}
									textOverflow={"ellipsis"}
									overflow={"hidden"}
								>
									{getModelLabel(model, true)}
								</Text>
								<IconButton
									flex={"0 0 auto"}
									margin={-2}
									marginLeft="auto"
									marginRight={-2}
									padding={0}
									minHeight={"unset"}
									height={"unset"}
									size={"xs"}
									visibility={"hidden"}
									_groupHover={{ visibility: "visible" }}
									onClick={(e: React.MouseEvent) => {
										e.stopPropagation()
										const newValue = value.filter((v) => v.id !== model.id)
										onValueChange?.(newValue)
									}}
								>
									<FiX />
								</IconButton>
							</HStack>
						))
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
								if (containerRef.current?.contains(e.target as Node)) return
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
						gap={0}
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
									<ModelItem key={model.id} model={model} filterFn={filterFn} />
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

function ModelItem(props: { model: Selectable<Model>; filterFn?: (m: Model) => boolean }) {
	const { model, filterFn, ...restProps } = props
	const { isSelected, handlers } = useSelectable(model)

	if (filterFn && !filterFn(model)) return null

	return (
		<PanelListItem key={model.id} selectable selected={isSelected} {...restProps} {...handlers}>
			<Text title={model.filename} textOverflow="ellipsis" textWrap={"nowrap"} overflowX="hidden">
				{getModelLabel(model, true)}
			</Text>
			<HStack justifyContent={"space-between"}>
				<Text>{model.count} images</Text>
				<Text>{!isVersionModel(model) && getVersionLabel(model.version)}</Text>
			</HStack>
		</PanelListItem>
	)
}

function getModelLabel(model?: Model | VersionModel, noVersion?: boolean) {
	if (!model) return ""

	if (isVersionModel(model)) return `${model.name ?? model.version} (${model.modelCount} models)`

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

function buildModelFilter(
	query: string,
	selectedVersion: string | undefined,
): (m: Model | VersionModel) => boolean {
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
			m.filename.toLowerCase().includes(lower) || m.name?.toLowerCase().includes(lower)
	})

	if (selectedVersion) {
		matchers.push((m: Model) => m.version === selectedVersion)
	}
	if (selectedVersion === "") {
		matchers.push((m: Model) => !m.version)
	}

	if (matchers.length === 0)
		return (m: Model | VersionModel) => {
			if ("isVersion" in m && m.isVersion) return false
			return true
		}

	return (m: Model | VersionModel) => {
		if ("isVersion" in m && m.isVersion) {
			return m.version === selectedVersion
		}

		return matchers.every((fn) => fn(m))
	}
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
