export type WorkspaceMode = "develop" | "learn" | "analyze" | "experiment";

export type WorkspaceModeOption = {
  id: WorkspaceMode;
  label: string;
  shortLabel: string;
  description: string;
  detail: string;
};

export const WORKSPACE_MODE_OPTIONS: WorkspaceModeOption[] = [
  {
    id: "develop",
    label: "Develop",
    shortLabel: "DEV",
    description: "Editor-first software development.",
    detail: "Write, build, run, debug and use source control with the workbench kept clear."
  },
  {
    id: "learn",
    label: "Learn",
    shortLabel: "LEARN",
    description: "Guided execution without reducing the real toolchain.",
    detail: "Starts with the simplified execution view so runtime behavior is easier to follow."
  },
  {
    id: "analyze",
    label: "Analyze",
    shortLabel: "ANALYZE",
    description: "Runtime-first inspection and diagnosis.",
    detail: "Starts with the advanced execution view for traces, frames, values and timing."
  },
  {
    id: "experiment",
    label: "Experiment",
    shortLabel: "LAB",
    description: "Fast terminal and interactive execution.",
    detail: "Starts with the terminal open for prototypes, commands, live input and quick tests."
  }
];

export function workspaceModeLabel(mode: WorkspaceMode) {
  return WORKSPACE_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "Develop";
}
