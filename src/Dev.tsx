import { Flex, ScrollArea } from "@chakra-ui/react"
import { emitTo } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import JsonView from "@uiw/react-json-view"
import { useEffect, useRef } from "react"
import { useProxyRef } from "./hooks/valtioHooks"

type DevStateUpdatePayload = {
	key: string
	state: Record<string, unknown>
}

export async function updateDevState(key: string, state: Record<string, unknown>) {
	emitTo({ kind: "WebviewWindow", label: "dev" }, "update-dev-state", { key, state })
}

interface DevComponentProps extends ChakraProps {}

function Dev(props: DevComponentProps) {
	const { ...boxProps } = props

	const { state, snap } = useProxyRef<Record<string, unknown>>(() => ({}))
	const unlistenRef = useRef<() => void>(null)

	useEffect(() => {
		const webView = getCurrentWebviewWindow()
		console.log("webview", webView.label)
		let isMounted = true

		;(async () => {
			const unlisten = await webView.listen<DevStateUpdatePayload>("update-dev-state", (event) => {
				const { key, state: payloadState } = event.payload
				state[key] = payloadState
			})

			if (isMounted) {
				unlistenRef.current = unlisten
			} else {
				// If the component unmounted before listen resolved
				unlisten()
				console.log("unmounted")
			}
		})()

		return () => {
			isMounted = false
			unlistenRef.current?.()
			console.log("unmounted")
		}
	}, [state]) // Add dependencies if needed

	return (
		<ScrollArea.Root>
			<ScrollArea.Viewport asChild>
				<Flex width={"100vw"} height={"100vh"} {...boxProps}>
					<ScrollArea.Content asChild>
						<JsonView
							objectSortKeys={true}
							// collapsed={4}
							displayDataTypes={false}
							shouldExpandNodeInitially={(
								isExpanded,
								{ keys, level, keyName, value, parentValue },
							) => {
								if (Array.isArray(value)) return false
								return true
							}}
							value={snap}
						/>
					</ScrollArea.Content>
				</Flex>
			</ScrollArea.Viewport>
		</ScrollArea.Root>
	)
}

export default Dev
