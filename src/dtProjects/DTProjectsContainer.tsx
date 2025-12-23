import DTProjects from "./DTProjects"
import { DTPProvider } from "./state/context"

function DTProjectsContainer(props: ChakraProps) {
	return (
		<DTPProvider>
			<DTProjects {...props} />
		</DTPProvider>
	)
}

export default DTProjectsContainer
