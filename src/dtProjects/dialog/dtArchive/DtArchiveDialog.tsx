import { Field, FormatByte, Grid, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { path } from "@tauri-apps/api";
import { useCallback, useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import type { Snapshot } from "valtio";
import {
  clearDtArchivePlanCache,
  createDtArchive,
  createDtArchivePlan,
  type DtArchivePreview,
  type TensorCounts,
} from "@/commands";
import {
  IconButton,
  PanelButton,
  PanelListItem,
  PanelSection,
  PanelSectionHeader,
} from "@/components";
import PanelList from "@/components/PanelList";
import { useDTP } from "@/dtProjects/state/context";
import type { ProjectState } from "@/dtProjects/state/projects";
import {
  makeSelectable,
  type Selectable,
  useSelectable,
} from "@/hooks/useSelectableV";
import { useProxyRef } from "@/hooks/valtioHooks";
import { useSetting } from "@/state/settings";
import { openFolder } from "@/utils/tauri";
import type { DialogProps, ProjectExportDialogState } from "../types";

type ProjectItemState = Selectable<{
  id: number;
  project: ProjectState;
}>;

type ArchiveFormat = "jpg" | "png";

const tensorLabels: Record<keyof TensorCounts, string> = {
  tensorHistory: "Images",
  binaryMask: "Masks",
  shuffle: "Moodboard",
  custom: "Custom",
  depthMap: "Depth maps",
  colorPalette: "Color palettes",
  audio: "Audio",
  scribble: "Scribbles",
};

function DtArchiveDialog(props: DialogProps<ProjectExportDialogState>) {
  const { onClose, projectIds, ...restProps } = props;

  const { projects } = useDTP();
  const [formatSetting, setFormatSetting] = useSetting("dtArchive.format");
  const [folderSetting, setFolderSetting] = useSetting("dtArchive.folder");
  const planRequestId = useRef(0);

  const { state, snap } = useProxyRef(() => {
    const ps = projectIds.map(
      (id, index) =>
        makeSelectable(
          {
            id,
            project: projects.getProject(id),
          },
          index === 0,
        ) as ProjectItemState,
    );
    const state = {
      outputDir: folderSetting ?? "",
      format: formatSetting as ArchiveFormat,
      isPlanning: false,
      isArchiving: false,
      planError: "",
      archiveError: "",
      selectedProject: (ps[0] ?? null) as null | ProjectItemState,
      preview: null as DtArchivePreview | null,
      projects: ps,
    };
    return state;
  });

  useEffect(() => {
    return () => {
      void clearDtArchivePlanCache().catch((error) => {
        console.error("Failed to clear DTArchive plan cache", error);
      });
    };
  }, []);

  useEffect(() => {
    if (folderSetting !== null) return;

    path
      .documentDir()
      .then((documentsDir) => path.join(documentsDir, "Draw Things Archives"))
      .then((outputDir) => {
        state.outputDir = outputDir;
      })
      .catch((error) => {
        console.error("Failed to get the default archive output folder", error);
      });
  }, [folderSetting, state]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: proxy reads are triggered by the corresponding snapshot dependencies
  useEffect(() => {
    const requestId = ++planRequestId.current;
    state.preview = null;
    state.planError = "";

    const selectedProjectId = state.selectedProject?.id;

    if (selectedProjectId === undefined) {
      state.isPlanning = false;
      return;
    }

    state.isPlanning = true;
    const timeout = window.setTimeout(async () => {
      try {
        const preview = await createDtArchivePlan({
          projectId: selectedProjectId,
          lossless: state.format === "png",
          quality: 80,
          target: state.outputDir,
        });
        if (requestId === planRequestId.current) {
          state.preview = preview;
        }
      } catch (error) {
        if (requestId === planRequestId.current) {
          console.error("Failed to create DTArchive plan", error);
          state.planError = error instanceof Error ? error.message : String(error);
        }
      } finally {
        if (requestId === planRequestId.current) {
          state.isPlanning = false;
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      if (planRequestId.current === requestId) planRequestId.current++;
    };
  }, [snap.format, snap.outputDir, snap.selectedProject?.id, state]);

  const createArchives = useCallback(async () => {
    if (!state.outputDir || projectIds.length === 0) return;

    const outputDir = state.outputDir;
    const format = state.format;

    state.isArchiving = true;
    state.archiveError = "";
    try {
      for (const projectId of projectIds) {
        await createDtArchive({
          projectId,
          lossless: format === "png",
          quality: 80,
          target: outputDir,
        });
      }

      setFormatSetting(format);
      setFolderSetting(outputDir);
    } catch (error) {
      console.error("Failed to create DTArchive", error);
      state.archiveError = error instanceof Error ? error.message : String(error);
    } finally {
      state.isArchiving = false;
    }
  }, [projectIds, setFolderSetting, setFormatSetting, state]);

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
      <HStack justifyContent={"space-between"} gridColumn={"1 / span 3"}>
        <Text paddingX={2} color={"fg.1"} fontSize={"xl"} fontWeight={"600"}>
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
          selectionMode={"singleRequired"}
          itemsState={state.projects}
          keyFn={(p) => p.id}
          variant={"flat"}
        >
          {snap.projects.map((p) => (
            <ProjectItem key={p.id} projectState={p} />
          ))}
        </PanelList>
      </PanelSection>

      <PanelSection variant={"dialog"} asChild>
        <VStack paddingX={4} paddingY={2} gap={4} alignItems={"stretch"}>
          <PanelSectionHeader>Archive options</PanelSectionHeader>
          <Field.Root width={"full"}>
            <Field.Label>Output folder</Field.Label>
            <HStack width={"full"} gap={1}>
              <Input
                aria-label={"DTArchive output folder"}
                data-defctx={true}
                layerStyle={"borderA"}
                variant={"subtle"}
                value={snap.outputDir}
                onChange={(event) => {
                  state.outputDir = event.target.value;
                }}
              />
              <PanelButton
                aria-label={"Browse DTArchive output folder"}
                flex={"0 0 auto"}
                onClick={async () => {
                  const dir = await openFolder({
                    defaultPath: state.outputDir,
                    canCreateDirectories: true,
                    title: "Select output folder",
                  });
                  if (dir) state.outputDir = dir;
                }}
              >
                Browse
              </PanelButton>
            </HStack>
            {!snap.outputDir && (
              <Field.HelperText color="orange.solid">
                Select an output folder
              </Field.HelperText>
            )}
          </Field.Root>

          <VStack alignItems="stretch" gap={1}>
            <PanelSectionHeader>Output format</PanelSectionHeader>
            <HStack gap={0} padding={0} borderRadius="lg" layerStyle={"borderA"}>
              <PanelButton
                aria-label={"Use JPEG archive images"}
                flex={1}
                size="sm"
                tone={snap.format === "jpg" ? "selected" : "none"}
                onClick={() => {
                  state.format = "jpg";
                }}
                borderRadius="md"
                borderRightRadius={0}
              >
                JPG
              </PanelButton>
              <PanelButton
                aria-label={"Use PNG archive images"}
                flex={1}
                size="sm"
                tone={snap.format === "png" ? "selected" : "none"}
                onClick={() => {
                  state.format = "png";
                }}
                borderRadius="md"
                borderLeftRadius={0}
              >
                PNG
              </PanelButton>
            </HStack>
            <Text fontSize="sm" color="fg.1">
              {snap.format === "jpg"
                ? "Smaller archive using JPEG images."
                : "Larger archive using lossless PNG images."}
            </Text>
          </VStack>
        </VStack>
      </PanelSection>

      <PanelSection variant={"dialog"} asChild>
        <VStack paddingX={4} paddingY={2} gap={3} alignItems={"stretch"}>
          <PanelSectionHeader>Project details</PanelSectionHeader>
          {snap.isPlanning ? (
            <Text color="fg.2" fontSize="sm">
              Creating archive plan…
            </Text>
          ) : snap.planError ? (
            <Text color="red.solid" fontSize="sm">
              {snap.planError}
            </Text>
          ) : snap.preview ? (
            <ArchivePlanDetails preview={snap.preview} />
          ) : (
            <Text color="fg.2" fontSize="sm">
              Select a project to see its archive details.
            </Text>
          )}
        </VStack>
      </PanelSection>

      <HStack
        gridColumn={"1 / span 3"}
        justifyContent="space-between"
        gap={2}
        marginTop={2}
      >
        <VStack alignItems="start" gap={0}>
          {snap.preview && (
            <Text color="fg.1">
              Estimated archive size: <FormatByte value={snap.preview.estimate} />
            </Text>
          )}
          {snap.archiveError && (
            <Text color="red.solid" fontSize="sm">
              {snap.archiveError}
            </Text>
          )}
        </VStack>
        <PanelButton
          aria-label={"Create DTArchive"}
          onClick={createArchives}
          disabled={
            !snap.outputDir ||
            !snap.preview ||
            snap.isPlanning ||
            snap.isArchiving
          }
        >
          {snap.isArchiving ? "Creating…" : "Create Archive"}
        </PanelButton>
      </HStack>
    </Grid>
  );
}

function ArchivePlanDetails({
  preview,
}: {
  preview: Snapshot<DtArchivePreview>;
}) {
  const tensorEntries = (Object.entries(preview.tensors) as [
    keyof TensorCounts,
    number,
  ][]).filter(([, value]) => value > 0);

  return (
    <VStack alignItems="stretch" gap={3} fontSize="sm">
      <DetailsGrid>
        <Detail label="Current project size">
          <FormatByte value={preview.filesize} />
        </Detail>
        <Detail label="Generated images" value={preview.genImages} />
        <Detail label="Generated video clips" value={preview.genVideos} />
        <Detail label="Video frames" value={preview.videoFrames} />
        <Detail label="Extra tensors" value={preview.extraTensors} />
      </DetailsGrid>

      {tensorEntries.length > 0 && (
        <VStack alignItems="stretch" gap={1}>
          <Text color="fg.1" fontWeight="medium">
            Tensor resources
          </Text>
          <DetailsGrid>
            {tensorEntries.map(([key, value]) => (
              <Detail key={key} label={tensorLabels[key]} value={value} />
            ))}
          </DetailsGrid>
        </VStack>
      )}

      {preview.fileInUse && (
        <Text color="orange.solid">
          This project is currently open in Draw Things.
        </Text>
      )}
    </VStack>
  );
}

function DetailsGrid({ children }: React.PropsWithChildren) {
  return (
    <Grid gridTemplateColumns="minmax(0, 1fr) auto" gapX={4} gapY={1}>
      {children}
    </Grid>
  );
}

function Detail({
  label,
  value,
  children,
}: React.PropsWithChildren<{ label: string; value?: number }>) {
  return (
    <>
      <Text color="fg.2">{label}</Text>
      <Text color="fg.1" textAlign="right">
        {children ?? value}
      </Text>
    </>
  );
}

interface ProjectItemProps extends ChakraProps {
  projectState: ProjectItemState;
}
function ProjectItem(props: ProjectItemProps) {
  const { projectState } = props;
  const { handlers, isSelected } = useSelectable(projectState);

  return (
    <PanelListItem selectable selected={isSelected} {...handlers}>
      <span>{projectState.project?.name}</span>
    </PanelListItem>
  );
}

export default DtArchiveDialog;
