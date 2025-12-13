import DTProjects from "./DTProjects"
import { PDBProvider } from "./state/context"

function DTProjectsContainer(props: ChakraProps) {
	return (
		<PDBProvider>
			<DTProjects {...props} />
		</PDBProvider>
	)
}

export default DTProjectsContainer
