import { Box } from "@chakra-ui/react"
import { invoke } from '@tauri-apps/api/core'
import { TrayIcon } from "@tauri-apps/api/tray"

function Mini() {
	return <Box>Hello from the mini view!</Box>
}

export default Mini
console.log("mini is here")
await TrayIcon.new({
	id: "main",
  icon: "./icons/128x128.png",
	async action(event) {
		console.log(event)
	},
})
await invoke("init_panel")
