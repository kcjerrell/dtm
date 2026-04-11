import { Box, HStack, Text, VStack } from "@chakra-ui/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { useMemo } from "react"
import {
    IconButton,
    LinkButton,
    PanelListItem,
    PanelSection,
    PanelSectionHeader,
} from "@/components"
import { FaMinus, FaPlus, FiList, FiX, LuFolderTree } from "@/components/icons/icons"
import PanelList from "@/components/PanelList"
import { Slider } from "@/components/ui/slider"
import { useSelectable } from "@/hooks/useSelectableV"
import { useSetting } from "@/state/settings"
import type { ICommand } from "@/types"
import type { DialogProps, SettingsDialogState } from "../dialog/types"
import { useDTP } from "../state/context"
import type { WatchFolderState, WatchFoldersController } from "../state/watchFolders"
import GrantAccess from "./GrantAccess"

function useCommands(watchFolders: WatchFoldersController): ICommand<WatchFolderState>[] {
    const commands = useMemo(
        () => [
            {
                id: `watch-toggle-recursive`,
                label: "Toggle recursive",
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
                label: "Remove folder",
                icon: FaMinus,
                requiresSelection: true,
                onClick: (selected: readonly WatchFolderState[]) => {
                    watchFolders.removeWatchFolders(selected)
                },
                tip: "Remove selected folders",
            },
            {
                id: `watch-add-folder`,
                label: "Add folder",
                icon: FaPlus,
                onClick: async () => {
                    await watchFolders.pickWatchFolder()
                },
                tip: "Add folder",
            },
        ],
        [watchFolders],
    )

    return commands
}

export function SettingsPanel(props: DialogProps<SettingsDialogState>) {
    const { ...restProps } = props
    const { watchFolders, uiState } = useDTP()

    const [imageSize, setImageSize] = useSetting("ui.imageSize")

    const { folders } = watchFolders.useSnap()

    const folderCommands = useCommands(watchFolders)

    return (
        <VStack
            bgColor={"unset"}
            padding={1}
            flex="1 1 auto"
            alignItems="stretch"
            justifyContent={"flex-start"}
            overflowY="visible"
            height="auto"
            gap={2}
            color={"fg.1"}
            fontSize={"sm"}
            {...restProps}
        >
            <HStack width={"100%"} justifyContent={"space-between"}>
                <Text fontSize={"lg"} fontWeight={"600"} paddingX={1} flex={"1 1 auto"}>
                    Settings
                </Text>
                <IconButton
                    role={"button"}
                    aria-label={"Close dialog"}
                    flex={"0 0 auto"}
                    size="min"
                    onClick={() => uiState.showSettings(false)}
                >
                    <FiX />
                </IconButton>
            </HStack>
            <Text color={"fg.2"} fontSize={"sm"} paddingX={2}>
                Consider this a preview version, some features are currently missing or incomplete,
                and there are likely some bugs here and there. Report any issues or suggestions
                in&nbsp;
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
                <LinkButton onClick={() => openUrl("https://github.com/kcjerrell/dtm/issues")}>
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
                    "Folders in these locations will be scanned for Draw Things projects and model info files. \n\nFor most users, only the default folders will be needed. If you use a custom model folder, include it here."
                }
                commands={folderCommands}
                keyFn={(item) => item.id}
                variant="inset"
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

            <PanelSection variant={"dialog"} marginTop={4}>
                <PanelSectionHeader marginY={2}>Image Size</PanelSectionHeader>
                <Box paddingX={4} paddingY={4}>
                    <Slider
                        min={50}
                        max={400}
                        value={[imageSize]}
                        onValueChange={(value) => {
                            setImageSize(value.value[0])
                        }}
                    />
                    {imageSize < 100 && (
                        <Text marginTop={4} textAlign={"center"}>
                            Performance may be reduced at low values...
                        </Text>
                    )}
                </Box>
            </PanelSection>
        </VStack>
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
