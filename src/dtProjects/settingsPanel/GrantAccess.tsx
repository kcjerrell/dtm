import { Text } from "@chakra-ui/react"
import { pickDrawThingsFolder } from "@/commands"
import { PanelButton, PanelSection, PanelSectionHeader } from "@/components"
import { useDTP } from "../state/context"

interface GrantAccessProps extends ChakraProps {}

function GrantAccess(props: GrantAccessProps) {
    const { ...restProps } = props
    const { settings: storage, watchFolders } = useDTP()

    const storageSnap = storage.useSnap()
    const hasBookmark = !!storageSnap.permissions.bookmark

    return (
        <PanelSection padding={2} gap={1} display={hasBookmark ? "none" : undefined} {...restProps}>
            <PanelSectionHeader paddingY={1} paddingX={0}>
                Draw Things Access
            </PanelSectionHeader>
            <Text>
                To view your Draw Things projects, DTM needs access to your Draw Things data folder.
                After clicking the button, a file picker will open. Select the Documents folder.
            </Text>
            <Text>Note: DTM does not modify your projects.</Text>
            <PanelButton
                tone={"success"}
                onClick={async () => {
                    const bookmark = await pickDrawThingsFolder(watchFolders.containerPath)
                    if (!bookmark) return
                    if (bookmark.path !== watchFolders.defaultProjectPath) {
                        alert(
                            `Please select the correct folder: ${watchFolders.defaultProjectPath}`,
                        )
                        return
                    }
                    storage.updateSetting("permissions", "bookmark", bookmark.bookmark)
                    watchFolders.addDefaultDataFolder()
                }}
            >
                Select folder
            </PanelButton>
        </PanelSection>
    )
}

export default GrantAccess
