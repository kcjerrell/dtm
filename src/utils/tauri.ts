export * from "@dev/tauri"
import { invoke as tauriInvoke } from "@dev/tauri"

const cmds = {}

export const invoke = async (cmd: string, args?: any) => {
	if (!cmd.startsWith("plugin")) {
		console.log("tauri.invoke", cmd, args)

		if (cmd in cmds) cmds[cmd]++
		else cmds[cmd] = 1
	}
	const timeout = setTimeout(() => {
		console.log("tauri.invoke timeout", cmd, args)
	}, 5000)
	const res = await tauriInvoke(cmd, args)
	clearTimeout(timeout)
	return res
}

window.invokecount = () => console.log(cmds)
