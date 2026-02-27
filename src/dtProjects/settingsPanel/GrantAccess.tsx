import { Text } from "@chakra-ui/react"
import { useState } from "react"
import { PanelButton, PanelSection, PanelSectionHeader } from "@/components"
import { useDTP } from "../state/context"

interface GrantAccessProps extends ChakraProps {}

function GrantAccess(props: GrantAccessProps) {
    const { ...restProps } = props
    const { watchFolders } = useDTP()
    const snap = watchFolders.useSnap()
    const [isLoading, setIsLoading] = useState(false)

    const handleGrantAccess = async () => {
        setIsLoading(true)
        try {
            await watchFolders.pickDtFolder()
        } catch (e) {
            alert(`Couldn't add folder:\n\n${e}`)
            console.error(e)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <PanelSection
            padding={2}
            gap={1}
            display={snap.isDtFolderAdded ? "none" : undefined}
            {...restProps}
        >
            <PanelSectionHeader paddingY={1} paddingX={0}>
                Draw Things Access
            </PanelSectionHeader>
            <Text>
                To view your Draw Things projects, DTM needs access to your Draw Things data folder.
                After clicking the button, a file picker will open. Select the Documents folder.
            </Text>
            <Text>Note: DTM does not modify your projects.</Text>
            <PanelButton tone={"success"} isLoading={isLoading} onClick={handleGrantAccess}>
                Select folder
            </PanelButton>
        </PanelSection>
    )
}

export default GrantAccess
