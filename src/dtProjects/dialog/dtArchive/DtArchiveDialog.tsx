import { Grid, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect } from "react";
import { FiX } from "react-icons/fi";
import {
  IconButton,
  PanelButton,
  PanelListItem,
  PanelSection,
  PanelSectionHeader,
} from "@/components";
import PanelList from "@/components/PanelList";
import { useDTP } from "@/dtProjects/state/context";
import { ProjectState } from "@/dtProjects/state/projects";
import {
  makeSelectable,
  Selectable,
  useSelectable,
} from "@/hooks/useSelectableV";
import { useProxyRef } from "@/hooks/valtioHooks";
import type { DialogProps, ProjectExportDialogState } from "../types";

type ProjectItemState = Selectable<{
  id: number;
  project: ProjectState;
}>;

function DtArchiveDialog(props: DialogProps<ProjectExportDialogState>) {
  const { onClose, projectIds, ...restProps } = props;

  const { state, snap } = useProxyRef(() => ({
    selectedProject: null as null | ProjectItemState,
  }));

  const { projects } = useDTP();

  const { state: projectsState, snap: projectsSnap } = useProxyRef(() =>
    projectIds.map(
      (id) =>
        makeSelectable({
          id,
          project: projects.getProject(id),
        }) as ProjectItemState,
    ),
  );

  useEffect(() => {
    // projects.getProject()
  });

  return (
    <Grid
      width="100%"
      height="100%"
      // alignItems={"stretch"}
      gap={2}
      // justifyContent={"flex-start"}
      gridTemplateColumns={"1fr 1fr 1fr"}
      gridTemplateRows={"min-content 1fr min-content"}
      {...restProps}
    >
      <HStack
        justifyContent={"space-between"}
        bgColor={"#ff000044"}
        gridColumn={"1 / span 3"}
      >
        <Text paddingX={2} color={"fg.1"} fontSize={"md"} fontWeight={"600"}>
          Convert to DTArchive
        </Text>
        <IconButton
          role={"button"}
          aria-label={"close export dialog"}
          flex={"0 0 auto"}
          size="min"
          onClick={() => onClose()}
        >
          <FiX />
        </IconButton>
      </HStack>

      <PanelSection variant={"dialog"} gridTemplateColumns={"1fr"}>
        <PanelList
          onSelectionChanged={(p) => (state.selectedProject = p[0] ?? null)}
          selectionMode={"single"}
          itemsState={projectsState}
          keyFn={(p) => p.id}
          variant={"flat"}
        >
          {projectsSnap.map((p) => (
            <ProjectItem key={p.id} projectState={p} />
          ))}
        </PanelList>
      </PanelSection>

      <PanelSection variant={"dialog"} bgColor={"#ffff0055"} asChild>
        <VStack paddingX={4} paddingY={2} gap={1} alignItems={"stretch"}>
          <PanelSectionHeader>Options here</PanelSectionHeader>
          <VStack alignItems="stretch" gap={1} paddingX={0}>
            <HStack
              gap={0}
              padding={0}
              bgColor="bg.2"
              borderRadius="lg"
              layerStyle={"borderA"}
            >
              Another content
            </HStack>
            <Text fontSize="sm" color="fg.1">
              Some description
            </Text>
            <Text fontSize="sm" color="fg.1">
              More words
            </Text>
          </VStack>
        </VStack>
      </PanelSection>

      <PanelSection>Infos about the thang</PanelSection>

      <HStack
        gridColumn={"1 / span 3"}
        justifyContent="flex-end"
        gap={2}
        marginTop={2}
        bgColor={"#ff00ff55"}
      >
        <PanelButton aria-label={"Start project export"} onClick={() => {}}>
          Do it
        </PanelButton>
      </HStack>
    </Grid>
  );
}

interface ProjectItemProps extends ChakraProps {
  projectState: ProjectItemState;
}
function ProjectItem(props: ProjectItemProps) {
  const { projectState } = props;
  const { isSelected, handlers } = useSelectable(projectState);

  return (
    <PanelListItem selectable selected={projectState.selected} {...handlers}>
      <span>{projectState.project?.name}</span>
    </PanelListItem>
  );
}

export default DtArchiveDialog;
