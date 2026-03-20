import { Box, Icon } from "@chakra-ui/react"
import { relaunch } from "@tauri-apps/plugin-process"
import { motion } from "motion/react"
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react"
import { useSnapshot } from "valtio"
import Sidebar, { SidebarButton } from "@/components/sidebar/Sidebar"
import { type ColorMode, useColorMode } from "@/components/ui/color-mode"
import AppStore from "@/hooks/appState"
import Spinner from "./Spinner"

const statusTips = {
    found: "Download update",
    installed: "Click to finish update",
    error: "Click to retry update",
    downloading: "Downloading update",
    installing: "Installing update",
} as const

const UpgradeButton = (props: Omit<ComponentProps<typeof SidebarButton>, "item">) => {
    const appSnap = useSnapshot(AppStore.store)
    const [message, setMessage] = useState<string | null>(null)
    // const [prevStatus, setPrevStatus] = useState(appSnap.updateStatus)

    const showMessage = useCallback((message: string, timeout: number = 4000) => {
        setMessage(message)
        setTimeout(() => setMessage(null), 4000)
    }, [])

    useEffect(() => {
        if (appSnap.updateStatus === "unknown") AppStore.checkForUpdate()

        if (appSnap.updateStatus === "found") {
            showMessage("Update available! Click to download.")
        }
        if (appSnap.updateStatus === "installed") {
            showMessage("Update installed! Click to restart.")
        }
        if (appSnap.updateStatus === "error") {
            showMessage("Update failed! Click to retry.")
        }
        if (appSnap.updateStatus === "downloading") {
            showMessage("Downloading update...", 1000)
        }
    }, [appSnap.updateStatus, showMessage])

    if (appSnap.updateAttempts >= 3) return null

    if (["checking", "unknown", "none", "error"].includes(appSnap.updateStatus)) return null

    if (["found", "installed", "downloading", "installing"].includes(appSnap.updateStatus)) {
        return (
            <SidebarButton
                update={true}
                item={{
                    label: "Update",
                    icon: null,
                    viewId: "upgrade",
                }}
                updating={
                    appSnap.updateStatus === "downloading" || appSnap.updateStatus === "installing"
                }
                onClick={async () => {
                    if (AppStore.store.updateStatus === "found") {
                        await AppStore.downloadAndInstallUpdate()
                    } else if (appSnap.updateStatus === "installed") await relaunch()
                    else if (appSnap.updateStatus === "error") await AppStore.retryUpdate()
                }}
                {...props}
                position={"relative"}
                zIndex={5}
            >
                <Sidebar.ButtonContent>
                    {appSnap.updateStatus === "downloading" ||
                    appSnap.updateStatus === "installing" ? (
                        <Spinner />
                    ) : (
                        <UpgradeIcon />
                    )}
                </Sidebar.ButtonContent>
                <Sidebar.ButtonLabel>Update</Sidebar.ButtonLabel>
                <Box
                    display={message ? "block" : "none"}
                    bgColor={"grayc.2"}
                    color={"grayc.14"}
                    fontSize={"sm"}
                    padding={2}
                    justifyContent={"center"}
                    alignContent={"center"}
                    position={"absolute"}
                    left={"calc(100% + 1rem)"}
                    top={0}
                    bottom={0}
                    width={"18rem"}
                    opacity={1}
                    borderRadius="md"
                    boxShadow="pane1"
                    border={"2px solid #66a676ff"}
                >
                    {message}
                </Box>
            </SidebarButton>
        )
    }
}

const UpgradeIcon = (props: ComponentProps<typeof Icon>) => {
    const { colorMode } = useColorMode()

    return (
        <Icon {...props} asChild>
            <motion.svg
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                animate={{
                    y: [0, 0, 1, -2, 1, -2, 0],
                }}
                transition={{
                    duration: 5,
                    times: [0, 0.5, 0.7, 0.725, 0.8, 0.825, 1],
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "easeOut",
                    delay: 0.7,
                }}
                whileHover={{ y: 0 }}
            >
                <g>
                    <UpgradePath
                        i={2}
                        d={
                            "M90.2344 0L0 60.1562L0 101.706L90.2344 41.55L180.469 101.706L180.469 60.1562L90.2344 0Z"
                        }
                        colorMode={colorMode}
                        tx={9.766}
                        ty={11.647}
                    />
                    <UpgradePath
                        i={1}
                        d="M58.9844 0L0 39.8141L0 75.0809L58.9844 35.2664L117.969 75.0809L117.969 39.8141L58.9844 0Z"
                        tx={41.016}
                        ty={61.664}
                        colorMode={colorMode}
                    />
                    <UpgradePath
                        i={0}
                        d="M33.9844 0L0 22.9395L0 49.3457L33.9844 26.6895L67.9688 49.3457L67.9688 22.9395L33.9844 0Z"
                        tx={66.016}
                        ty={105.414}
                        colorMode={colorMode}
                    />
                </g>
            </motion.svg>
        </Icon>
    )
}

const UpgradePath = ({
    d,
    tx,
    ty,
    i,
    colorMode,
}: {
    d: string
    tx: number
    ty: number
    i: number
    colorMode: ColorMode
}) => {
    const colorDuration = 5
    const fg = colorMode === "light" ? "#627463ff" : "#8e97a2"
    const fgb = colorMode === "light" ? "#476d53ff" : "#66a676ff"
    return (
        <motion.path
            d={d}
            animate={{
                fill: [fgb, fg, "#83ff67ff", fgb],
                scale: [1, 1.1, 1.2, 1],
            }}
            transition={{
                duration: colorDuration,
                times: [0, 0.8, 0.9, 1],
                ease: ["easeOut", "linear", "linear"],
                repeat: Infinity,
                repeatType: "loop",
                delay: 0.1 * i,
            }}
            stroke-width="0"
            stroke="#000000"
            style={{ x: tx, y: ty * 1.3 }}
        />
    )
}

export default UpgradeButton
