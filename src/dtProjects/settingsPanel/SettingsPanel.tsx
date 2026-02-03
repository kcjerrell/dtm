import { Box, Text, VStack } from "@chakra-ui/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { useMemo } from "react"
import { LinkButton, PanelListItem, PanelSection, PanelSectionHeader } from "@/components"
import { FaMinus, FaPlus, FiList, LuFolderTree } from "@/components/icons/icons"
import PanelList, { type PanelListCommand } from "@/components/PanelList"
import { Slider } from "@/components/ui/slider"
import { useSelectable } from "@/hooks/useSelectableV"
import { openAnd } from "@/utils/helpers"
import { ContentPanelPopup, type ContentPanelPopupProps } from "../imagesList/ContentPanelPopup"
import { useDTP } from "../state/context"
import type { WatchFolderState, WatchFoldersController } from "../state/watchFolders"
import GrantAccess from "./GrantAccess"
import ResetPermission from "./ResetPermission"

function useCommands(watchFolders: WatchFoldersController): PanelListCommand<WatchFolderState>[] {
    const commands = useMemo(
        () => [
            {
                id: `watch-toggle-recursive`,
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
                id: `watch-remove-folders`,
                icon: FaMinus,
                requiresSelection: true,
                onClick: (selected: readonly WatchFolderState[]) => {
                    watchFolders.removeWatchFolders(selected)
                },
                tip: "Remove selected folders",
            },
            {
                id: `watch-add-folder`,
                icon: FaPlus,
                onClick: () =>
                    openAnd((f) => watchFolders.addWatchFolder(f), {
                        directory: true,
                        multiple: false,
                        title: `Select watch folder`,
                    }),
                tip: "Add folder",
            },
        ],
        [watchFolders],
    )

    return commands
}

export function SettingsPanel(props: Omit<ContentPanelPopupProps, "onClose" | "children">) {
    const { ...restProps } = props
    const { images, watchFolders, uiState } = useDTP()
    const imagesSnap = images.useSnap()

    const { folders } = watchFolders.useSnap()

    const folderCommands = useCommands(watchFolders)

    return (
        <ContentPanelPopup
            onClose={() => uiState.showSettings(false)}
            flexDir={"column"}
            shadeProps={{
                pointerEvents: "auto",
                bgColor: "#00000022",
                backdropFilter: "blur(2px)",
            }}
            overflow="visible"
            {...restProps}
        >
            <Box
                color={"fg.1"}
                overflowY="scroll"
                // paddingRight={2}
                marginRight={-1}
                scrollbarGutter={"stable"}
                _scrollbar={{ backgroundColor: "none", width: "8px", borderRadius: "0 50% 50% 0" }}
                _scrollbarThumb={{
                    backgroundColor: "fg.2/50",
                    width: "4px",
                    borderRadius: "2px 7px 7px 2px",
                    boxShadow: "pane1",
                    borderRight: "1px solid",
                    borderColor: "bg.1",
                }}
                // style={{ "-webkit-scrollbar-track": { backgroundColor: "blue" } }}
            >
                <VStack
                    bgColor={"unset"}
                    padding={1}
                    flex="1 1 auto"
                    alignItems="stretch"
                    justifyContent={"flex-start"}
                    overflowY="visible"
                    height="auto"
                    gap={2}
                >
                    <Text fontSize={"lg"} fontWeight={"600"} paddingX={1}>
                        Settings
                    </Text>
                    <Text color={"fg.2"} fontSize={"sm"} paddingX={2}>
                        Consider this a preview version, some features are currently missing or
                        incomplete, and there are likely some bugs here and there. Report any issues
                        or suggestions in&nbsp;
                        <LinkButton
                            onClick={() =>
                                openUrl(
                                    "https://discord.com/channels/1038516303666876436/1459386699141480665",
                                )
                            }
                        >
                            Discord
                        </LinkButton>
                        &nbsp;or&nbsp;
                        <LinkButton
                            onClick={() => openUrl("https://github.com/kcjerrell/dtm/issues")}
                        >
                            GitHub
                        </LinkButton>
                        .
                    </Text>
                    <GrantAccess />
                    <PanelList
                        flex={"0 0 auto"}
                        height={"min-content"}
                        itemsState={() => watchFolders.state.folders}
                        header={"Watch locations"}
                        headerInfo={
                            "Folders in these locations will be scanned for Draw Things projects and model info files. \n\nFor most users, only the default folders will be needed."
                        }
                        commands={folderCommands}
                        keyFn={(item) => item.id}
                    >
                        {folders.map((folder) => (
                            <WatchFolderItem key={folder.id} folder={folder} />
                        ))}

                        {folders.length === 0 && (
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
                    <ResetPermission />
                </VStack>
            </Box>
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
