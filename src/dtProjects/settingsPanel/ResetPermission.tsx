import { Text, VStack } from "@chakra-ui/react"
import { relaunch } from "@tauri-apps/plugin-process"
import { PanelButton, PanelSection, PanelSectionHeader } from "@/components"
import { useDTP } from "../state/context"

interface ResetPermissionProps extends ChakraProps {}

function ResetPermission(props: ResetPermissionProps) {
    const { ...restProps } = props
    const { settings: storage } = useDTP()

    const storageSnap = storage.useSnap()
    const hasBookmark = !!storageSnap.permissions.bookmark

    return (
        <PanelSection display={hasBookmark ? undefined : "none"} {...restProps}>
            <PanelSectionHeader padding={2}>Reset Permission</PanelSectionHeader>
            <VStack>
                <Text paddingX={2}>
                    Permission granted to use Draw Thing's data. If this no longer seems to be
                    working, you can reset it by clicking the button below. This will clear the
                    permissions and relaunch the app.
                </Text>
                <PanelButton
                    onClick={async () => {
                        storage.updateSetting("permissions", "bookmark", null)
                        setTimeout(() => relaunch(), 300)
                    }}
                    tone={"danger"}
                >
                    Reset
                </PanelButton>
            </VStack>
        </PanelSection>
    )
}

export default ResetPermission
