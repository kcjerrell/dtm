import { Box } from '@chakra-ui/react'
import { getCurrentWindow } from '@tauri-apps/api/window'

let windowPosition: [number, number] | undefined

function TauriDragHandle() {
  return (
    <Box
				data-tauri-drag-region="true"
				position={"absolute"}
				zIndex={50}
				top={0}
				left={0}
				right={0}
				height={"2.5rem"}
				onPointerDown={async () => {
					const win = await getCurrentWindow()
					const pos = await win.outerPosition()
					windowPosition = [pos.x, pos.y]
				}}
				onClick={async (e) => {
					const win = await getCurrentWindow()
					const pos = await win.outerPosition()
					if (windowPosition && pos.x === windowPosition[0] && pos.y === windowPosition[1]) {
						const elems = document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]
						for (const elem of elems) {
							if (elem.getAttribute("data-tauri-drag-region") === "true") continue
							else {
								elem.click()
								break
							}
						}
					}
				}}
				onDrag={() => console.log("dragged drag region")}
			/>
  )
}

export default TauriDragHandle