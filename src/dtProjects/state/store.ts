import { store } from "@tauri-store/valtio"
import { DTPStateController } from "./StateController"

const dtpStore = store("dtp", {
	selectedTab: "settings",
})

class StoreStateController extends DTPStateController {
	state: object
}
