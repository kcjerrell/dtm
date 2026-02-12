import { Text, ChakraProps } from "@chakra-ui/react"
import { pickFolder } from "@/commands"
import { PanelButton, PanelSection, PanelSectionHeader } from "@/components"
import { useDTP } from "../state/context"
import { useState } from "react"

interface GrantAccessProps extends ChakraProps {}

function GrantAccess(props: GrantAccessProps) {
    const { ...restProps } = props
    const { settings: storage, watchFolders } = useDTP()
    const [isLoading, setIsLoading] = useState(false)

    const storageSnap = storage.useSnap()
    const hasBookmark = !!storageSnap.permissions.bookmark

    const handleGrantAccess = async () => {
        setIsLoading(true)
        try {
            const result = await pickFolder(watchFolders.containerPath, "Select Documents folder")
            if (!result) return
            
            if (result.path !== watchFolders.defaultProjectPath) {
                 // Warn user if they selected the wrong folder, but maybe we should allow it?
                 // The original code enforced equality. I'll ask the user or keep it for now.
                 // The prompt didn't say to remove this check, so I'll keep it but adapted.
                 alert(`Please select the correct folder: ${watchFolders.defaultProjectPath}`)
                 return
            }

            storage.updateSetting("permissions", "bookmark", result.bookmark)
            watchFolders.addDefaultDataFolder()
        } catch (e) {
            console.error(e)
        } finally {
            setIsLoading(false)
        }
    }

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
                isLoading={isLoading}
                onClick={handleGrantAccess}
            >
                Select folder
            </PanelButton>
        </PanelSection>
    )
}

export default GrantAccess
