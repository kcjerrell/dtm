import { Box, Text, VStack } from "@chakra-ui/react"
import { useMemo } from "react"
import { PanelButton, PanelListItem, PanelSection, PanelSectionHeader } from "@/components"
import { FaMinus, FaPlus, FiList, LuFolderTree } from "@/components/icons"
import PanelList, { type PanelListCommand } from "@/components/PanelList"
import { Slider } from "@/components/ui/slider"
import { useSelectable } from "@/hooks/useSelectableV"
import { openAnd } from "@/utils/helpers"
import { ContentPanelPopup, type ContentPanelPopupProps } from "./imagesList/ContentPanelPopup"
import { useDTP } from "./state/context"
import type { WatchFolderState, WatchFoldersController } from "./state/watchFolders"

function useCommands(
    folderType: "Projects" | "ModelInfo",
    watchFolders: WatchFoldersController,
): PanelListCommand<WatchFolderState>[] {
    const ft = folderType === "Projects" ? "proj" : "modinfo"
    const commands = useMemo(
        () => [
            {
                id: `${ft}-toggle-recursive`,
                getIcon: (selected: readonly WatchFolderState[]) =>
                    selected[0]?.recursive ? FiList : LuFolderTree,
                requiresSelection: true,
                onClick: (selected: readonly WatchFolderState[]) => {
                    watchFolders.setRecursive(selected, !selected[0]?.recursive)
                },
                getTip: (selected: readonly WatchFolderState[]) =>
                    selected[0]?.recursive ? "Disable recursive" : "Enable recursive",
            },
            {
                id: `${ft}-remove-folders`,
                icon: FaMinus,
                requiresSelection: true,
                onClick: (selected: readonly WatchFolderState[]) => {
                    watchFolders.removeWatchFolders(selected)
                },
                tip: "Remove selected folders",
            },
            {
                id: `${ft}-add-folder`,
                icon: FaPlus,
                onClick: () =>
                    openAnd((f) => watchFolders.addWatchFolder(f, folderType), {
                        directory: true,
                        multiple: false,
                        title: `Select ${folderType.toLowerCase()} folder`,
                    }),
                tip: "Add folder",
            },
        ],
        [folderType, watchFolders, ft],
    )

    return commands
}

export function SettingsPanel(props: Omit<ContentPanelPopupProps, "onClose" | "children">) {
    const { ...restProps } = props
    const { images, watchFolders, uiState } = useDTP()
    const imagesSnap = images.useSnap()

    const { hasModelInfoDefault, hasProjectDefault, modelInfoFolders, projectFolders } =
        watchFolders.useSnap()

    const projectFolderCommands = useCommands("Projects", watchFolders)
    const modelInfoFolderCommands = useCommands("ModelInfo", watchFolders)

    return (
        <ContentPanelPopup
            onClose={() => uiState.showSettings(false)}
            flexDir={"column"}
            overflowY="auto"
            shadeProps={{
                pointerEvents: "auto",
                bgColor: "#00000022",
                backdropFilter: "blur(2px)",
            }}
            {...restProps}
        >
            <VStack
                bgColor={"unset"}
                padding={1}
                flex="1 1 auto"
                alignItems="stretch"
                justifyContent={"flex-start"}
                overflowY="auto"
                height="auto"
                gap={0}
            >
                <Text fontSize={"lg"} fontWeight={"600"} padding={1}>
                    Settings
                </Text>
                <PanelList
                    flex={"0 1 auto"}
                    height={"min-content"}
                    itemsState={() => watchFolders.state.projectFolders}
                    header={"Project locations"}
                    headerInfo={
                        "Draw Things projects in these folders will be indexed and listed in the projects tab. \n\nFor most users, only the default folder will be needed. If you move your projects to external storage, you can include the locations here."
                    }
                    commands={projectFolderCommands}
                    keyFn={(item) => item.id}
                    clearSelection={modelInfoFolders.some((f) => f.selected)}
                >
                    {projectFolders.map((folder) => (
                        <WatchFolderItem key={folder.id} folder={folder} />
                    ))}

                    {projectFolders.length === 0 && (
                        <Box
                            alignSelf={"center"}
                            margin={"auto"}
                            paddingY={"1rem"}
                            justifySelf={"center"}
                            opacity={0.7}
                            color={"fg.2"}
                            fontStyle={"italic"}
                        >
                            (no folders added)
                        </Box>
                    )}
                </PanelList>

                {!hasProjectDefault && (
                    <PanelButton
                        margin={2}
                        onClick={() => watchFolders.addDefaultWatchFolder("Projects")}
                    >
                        Add default location
                    </PanelButton>
                )}

                <PanelList
                    flex={"0 1 auto"}
                    height={"min-content"}
                    marginTop={4}
                    itemsState={() => watchFolders.state.modelInfoFolders}
                    header={"Model info"}
                    headerInfo={
                        "Model info files in these folders will be indexed to improve search and provide more useful context. \n\nIf you use the External Model Folder setting in Draw Things, add that folder here."
                    }
                    commands={modelInfoFolderCommands}
                    keyFn={(item) => item.id}
                    clearSelection={projectFolders.some((f) => f.selected)}
                >
                    {modelInfoFolders.map((folder) => (
                        <WatchFolderItem key={folder.id} folder={folder} />
                    ))}
                    {modelInfoFolders.length === 0 && (
                        <Box
                            alignSelf={"center"}
                            margin={"auto"}
                            paddingY={"1rem"}
                            justifySelf={"center"}
                            opacity={0.7}
                            color={"fg.2"}
                            fontStyle={"italic"}
                        >
                            (no folders added)
                        </Box>
                    )}
                </PanelList>

                {!hasModelInfoDefault && (
                    <PanelButton
                        margin={2}
                        onClick={() => watchFolders.addDefaultWatchFolder("ModelInfo")}
                    >
                        Add default locations
                    </PanelButton>
                )}

                <PanelSection marginTop={4}>
                    <PanelSectionHeader marginY={2}>Thumbnail columns</PanelSectionHeader>
                    <Box paddingX={4} paddingY={4}>
                        <Slider
                            min={2}
                            max={12}
                            value={[imagesSnap.imageSize ?? 5]}
                            onValueChange={(value) => {
                                images.state.imageSize = value.value[0]
                            }}
                        />
                        {imagesSnap.imageSize && imagesSnap.imageSize > 8 && (
                            <Text marginTop={4} textAlign={"center"}>
                                Performance may be reduced at high values...
                            </Text>
                        )}
                    </Box>
                </PanelSection>
            </VStack>
        </ContentPanelPopup>
    )
}

function WatchFolderItem(props: { folder: WatchFolderState }) {
    const { folder, ...restProps } = props
    const { isSelected, handlers } = useSelectable(folder)

    return (
        <PanelListItem
            key={folder.id}
            selectable
            selected={isSelected}
            {...restProps}
            {...handlers}
        >
            <span>
                {folder.path}
                {folder.recursive && (
                    <LuFolderTree style={{ display: "inline", marginLeft: "0.5rem" }} />
                )}
            </span>
        </PanelListItem>
    )
}
