import { createContext, type PropsWithChildren, useContext } from "react"
import { useInitRef } from "@/hooks/useInitRef"
import { UIStateController } from "@/metadata/state/uiState"

export type PDBContextType = {
	uiState: UIStateController
}

export const PDBContext = createContext<PDBContextType | undefined>(undefined)

export function PDBProvider(props: PropsWithChildren) {
	const stateControllers = useInitRef(() => {
		const uiState = new UIStateController()

		return { uiState }
	})

	return <PDBContext value={stateControllers}>{props.children}</PDBContext>
}

export function usePDB() {
	const ctx = useContext(PDBContext)
	if (!ctx) {
		throw new Error("usePDB must be used within a PDBProvider")
	}
	return ctx
}