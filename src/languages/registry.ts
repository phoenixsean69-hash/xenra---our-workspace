import type {
  CommandPlan,
  LanguageDefinition,
  PlanResolution,
  ToolchainId,
  ToolchainReport
} from "./types";

export const LANGUAGE_REGISTRY: LanguageDefinition[] = [
  { id: "python", name: "Python", monaco: "python", extensions: ["py", "pyw"], category: "programming", runnable: true, buildable: true, toolchains: ["python"] },
  { id: "javascript", name: "JavaScript", monaco: "javascript", extensions: ["js", "mjs", "cjs", "jsx"], category: "programming", runnable: true, buildable: true, toolchains: ["node"] },
  { id: "typescript", name: "TypeScript", monaco: "typescript", extensions: ["ts", "tsx", "mts", "cts"], category: "programming", runnable: true, buildable: true, toolchains: ["tsx", "ts-node", "tsc"] },
  { id: "c", name: "C", monaco: "c", extensions: ["c"], category: "programming", runnable: true, buildable: true, toolchains: ["gcc", "clang"] },
  { id: "cpp", name: "C++", monaco: "cpp", extensions: ["cc", "cpp", "cxx", "c++", "hpp", "hh", "hxx", "h"], category: "programming", runnable: true, buildable: true, toolchains: ["g++", "clang++"] },
  { id: "java", name: "Java", monaco: "java", extensions: ["java"], category: "programming", runnable: true, buildable: true, toolchains: ["javac", "java"] },
  { id: "csharp", name: "C#", monaco: "csharp", extensions: ["cs"], category: "programming", runnable: true, buildable: true, toolchains: ["dotnet", "csc"] },
  { id: "go", name: "Go", monaco: "go", extensions: ["go"], category: "programming", runnable: true, buildable: true, toolchains: ["go"] },
  { id: "rust", name: "Rust", monaco: "rust", extensions: ["rs"], category: "programming", runnable: true, buildable: true, toolchains: ["rustc", "cargo"] },
  { id: "php", name: "PHP", monaco: "php", extensions: ["php"], category: "programming", runnable: true, buildable: true, toolchains: ["php"] },
  { id: "ruby", name: "Ruby", monaco: "ruby", extensions: ["rb"], category: "programming", runnable: true, buildable: true, toolchains: ["ruby"] },
  { id: "powershell", name: "PowerShell", monaco: "powershell", extensions: ["ps1", "psm1"], category: "programming", runnable: true, buildable: false, toolchains: ["powershell"] },
  { id: "shell", name: "Shell / Bash", monaco: "shell", extensions: ["sh", "bash"], category: "programming", runnable: true, buildable: true, toolchains: ["bash"] },
  { id: "assembly", name: "Assembly", monaco: "asm", extensions: ["asm", "s"], category: "programming", runnable: true, buildable: true, toolchains: ["nasm", "gcc", "clang", "as"] },
  { id: "html", name: "HTML", monaco: "html", extensions: ["html", "htm"], category: "web", runnable: false, buildable: false, toolchains: [] },
  { id: "css", name: "CSS", monaco: "css", extensions: ["css"], category: "web", runnable: false, buildable: false, toolchains: [] },
  { id: "scss", name: "SCSS", monaco: "scss", extensions: ["scss"], category: "web", runnable: false, buildable: false, toolchains: [] },
  { id: "json", name: "JSON", monaco: "json", extensions: ["json"], category: "data", runnable: false, buildable: false, toolchains: [] },
  { id: "yaml", name: "YAML", monaco: "yaml", extensions: ["yaml", "yml"], category: "data", runnable: false, buildable: false, toolchains: [] },
  { id: "xml", name: "XML", monaco: "xml", extensions: ["xml"], category: "data", runnable: false, buildable: false, toolchains: [] },
  { id: "sql", name: "SQL", monaco: "sql", extensions: ["sql"], category: "data", runnable: false, buildable: false, toolchains: [] },
  { id: "markdown", name: "Markdown", monaco: "markdown", extensions: ["md", "markdown"], category: "text", runnable: false, buildable: false, toolchains: [] },
  { id: "plaintext", name: "Plain Text", monaco: "plaintext", extensions: ["txt"], category: "text", runnable: false, buildable: false, toolchains: [] }
];

const byExtension = new Map<string, LanguageDefinition>();
for (const language of LANGUAGE_REGISTRY) {
  for (const extension of language.extensions) {
    byExtension.set(extension.toLowerCase(), language);
  }
}

function extensionOf(path: string) {
  const file = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(dot + 1).toLowerCase() : "";
}

function baseName(path: string) {
  const file = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

function quote(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function status(report: ToolchainReport, id: ToolchainId) {
  return report.tools.find((item) => item.id === id && item.available) ?? null;
}

function toolCommand(report: ToolchainReport, id: ToolchainId) {
  const item = status(report, id);
  if (!item?.command) return null;
  return [item.command, ...(item.prefixArgs ?? [])].join(" ");
}

function firstTool(report: ToolchainReport, ids: ToolchainId[]) {
  for (const id of ids) {
    const command = toolCommand(report, id);
    if (command) return { id, command };
  }
  return null;
}

function prepareBuildDir(platform: string, directory = ".xenra-build") {
  return platform === "win32"
    ? `New-Item -ItemType Directory -Force -Path ${quote(directory)} | Out-Null`
    : `mkdir -p ${quote(directory)}`;
}

function outputPath(platform: string, name: string) {
  return platform === "win32"
    ? `.xenra-build\\${name}.exe`
    : `.xenra-build/${name}`;
}

function runBuilt(platform: string, output: string) {
  return platform === "win32"
    ? `& ${quote(`.\\${output}`)}`
    : quote(`./${output}`);
}

function compilePlan(platform: string, compile: string, run?: string, directory = ".xenra-build") {
  const prepare = prepareBuildDir(platform, directory);
  if (platform === "win32") {
    return run
      ? `${prepare}; ${compile}; if ($LASTEXITCODE -eq 0) { ${run} }`
      : `${prepare}; ${compile}`;
  }
  return run
    ? `${prepare} && ${compile} && ${run}`
    : `${prepare} && ${compile}`;
}

function ok(
  kind: "run" | "build",
  language: LanguageDefinition,
  command: string,
  toolchains: ToolchainId[],
  description: string
): PlanResolution {
  const plan: CommandPlan = {
    kind,
    languageId: language.id,
    languageName: language.name,
    command,
    toolchains,
    description
  };
  return { ok: true, plan };
}

function fail(
  language: LanguageDefinition | undefined,
  message: string,
  missing: ToolchainId[] = []
): PlanResolution {
  return { ok: false, language, message, missing };
}

export function languageForPath(path: string) {
  return byExtension.get(extensionOf(path)) ?? null;
}

export function monacoLanguageForPath(path: string) {
  return languageForPath(path)?.monaco ?? "plaintext";
}

export function createRunPlan(path: string, content: string, report: ToolchainReport): PlanResolution {
  const language = languageForPath(path);
  if (!language) return fail(undefined, "No XENRA language adapter exists for this file type yet.");
  if (!language.runnable) return fail(language, `${language.name} is editor-supported but not directly runnable.`);

  const platform = report.platform;
  const source = quote(path);
  const name = baseName(path);

  switch (language.id) {
    case "python": {
      const python = toolCommand(report, "python");
      return python
        ? ok("run", language, `${python} ${source}`, ["python"], "Run Python file")
        : fail(language, "Python runtime not detected.", ["python"]);
    }
    case "javascript": {
      const node = toolCommand(report, "node");
      return node
        ? ok("run", language, `${node} ${source}`, ["node"], "Run JavaScript with Node.js")
        : fail(language, "Node.js runtime not detected.", ["node"]);
    }
    case "typescript": {
      const tsx = toolCommand(report, "tsx");
      if (tsx) return ok("run", language, `${tsx} ${source}`, ["tsx"], "Run TypeScript with tsx");
      const tsNode = toolCommand(report, "ts-node");
      if (tsNode) return ok("run", language, `${tsNode} ${source}`, ["ts-node"], "Run TypeScript with ts-node");
      return fail(language, "No direct TypeScript runner detected. Install tsx or ts-node, or use the project's npm scripts.", ["tsx", "ts-node"]);
    }
    case "c":
    case "cpp": {
      const compiler = language.id === "c"
        ? firstTool(report, ["gcc", "clang"])
        : firstTool(report, ["g++", "clang++"]);
      if (!compiler) {
        return fail(language, `${language.name} compiler not detected.`, language.id === "c" ? ["gcc", "clang"] : ["g++", "clang++"]);
      }
      const output = outputPath(platform, name);
      const compile = `${compiler.command} ${source} -o ${quote(output)}`;
      return ok("run", language, compilePlan(platform, compile, runBuilt(platform, output)), [compiler.id], `Build and run ${language.name}`);
    }
    case "java": {
      const javac = toolCommand(report, "javac");
      const java = toolCommand(report, "java");
      if (!javac || !java) return fail(language, "Java requires both javac and java.", ["javac", "java"]);
      const packageMatch = content.match(/^\s*package\s+([A-Za-z_][\w.]*)\s*;/m);
      const className = packageMatch ? `${packageMatch[1]}.${name}` : name;
      const directory = ".xenra-build/java";
      const prepare = prepareBuildDir(platform, directory);
      const compile = `${javac} -d ${quote(directory)} ${source}`;
      const run = `${java} -cp ${quote(directory)} ${quote(className)}`;
      const command = platform === "win32"
        ? `${prepare}; ${compile}; if ($LASTEXITCODE -eq 0) { ${run} }`
        : `${prepare} && ${compile} && ${run}`;
      return ok("run", language, command, ["javac", "java"], "Compile and run Java");
    }
    case "csharp": {
      const dotnet = toolCommand(report, "dotnet");
      if (dotnet) return ok("run", language, `${dotnet} run`, ["dotnet"], "Run .NET project from the XENRA project root");
      const csc = toolCommand(report, "csc");
      if (csc && platform === "win32") {
        const output = outputPath(platform, name);
        const compile = `${csc} /nologo /out:${quote(output)} ${source}`;
        return ok("run", language, compilePlan(platform, compile, runBuilt(platform, output)), ["csc"], "Compile and run C# with csc");
      }
      return fail(language, "No usable .NET SDK or C# compiler detected.", ["dotnet", "csc"]);
    }
    case "go": {
      const go = toolCommand(report, "go");
      return go
        ? ok("run", language, `${go} run ${source}`, ["go"], "Run Go file")
        : fail(language, "Go toolchain not detected.", ["go"]);
    }
    case "rust": {
      const rustc = toolCommand(report, "rustc");
      if (!rustc) return fail(language, "Rust compiler not detected.", ["rustc"]);
      const output = outputPath(platform, name);
      const compile = `${rustc} ${source} -o ${quote(output)}`;
      return ok("run", language, compilePlan(platform, compile, runBuilt(platform, output)), ["rustc"], "Compile and run Rust");
    }
    case "php": {
      const php = toolCommand(report, "php");
      return php
        ? ok("run", language, `${php} ${source}`, ["php"], "Run PHP file")
        : fail(language, "PHP runtime not detected.", ["php"]);
    }
    case "ruby": {
      const ruby = toolCommand(report, "ruby");
      return ruby
        ? ok("run", language, `${ruby} ${source}`, ["ruby"], "Run Ruby file")
        : fail(language, "Ruby runtime not detected.", ["ruby"]);
    }
    case "powershell": {
      const powershell = toolCommand(report, "powershell");
      return powershell
        ? ok("run", language, `${powershell} -NoProfile -ExecutionPolicy Bypass -File ${source}`, ["powershell"], "Run PowerShell script")
        : fail(language, "PowerShell runtime not detected.", ["powershell"]);
    }
    case "shell": {
      const bash = toolCommand(report, "bash");
      return bash
        ? ok("run", language, `${bash} ${source}`, ["bash"], "Run shell script with Bash")
        : fail(language, "Bash runtime not detected.", ["bash"]);
    }
    case "assembly": {
      const ext = extensionOf(path);
      if (ext === "asm") {
        const nasm = toolCommand(report, "nasm");
        const linker = firstTool(report, ["gcc", "clang"]);
        if (!nasm || !linker) return fail(language, "NASM-style Assembly requires NASM plus GCC or Clang for linking.", ["nasm", "gcc", "clang"]);
        const object = platform === "win32" ? `.xenra-build\\${name}.obj` : `.xenra-build/${name}.o`;
        const output = outputPath(platform, name);
        const format = platform === "win32" ? "win64" : platform === "darwin" ? "macho64" : "elf64";
        const assemble = `${nasm} -f ${format} ${source} -o ${quote(object)}`;
        const linkExtra = platform === "linux" ? " -no-pie" : "";
        const link = `${linker.command}${linkExtra} ${quote(object)} -o ${quote(output)}`;
        const prepare = prepareBuildDir(platform);
        const command = platform === "win32"
          ? `${prepare}; ${assemble}; if ($LASTEXITCODE -eq 0) { ${link}; if ($LASTEXITCODE -eq 0) { ${runBuilt(platform, output)} } }`
          : `${prepare} && ${assemble} && ${link} && ${runBuilt(platform, output)}`;
        return ok("run", language, command, ["nasm", linker.id], "Assemble, link and run NASM Assembly");
      }
      const driver = firstTool(report, ["gcc", "clang"]);
      if (!driver) return fail(language, "GNU/LLVM-style Assembly requires GCC or Clang.", ["gcc", "clang"]);
      const output = outputPath(platform, name);
      const compile = `${driver.command} ${source} -o ${quote(output)}`;
      return ok("run", language, compilePlan(platform, compile, runBuilt(platform, output)), [driver.id], "Assemble, link and run Assembly");
    }
    default:
      return fail(language, `${language.name} does not yet have a Run adapter.`);
  }
}

export function createBuildPlan(path: string, content: string, report: ToolchainReport): PlanResolution {
  const language = languageForPath(path);
  if (!language) return fail(undefined, "No XENRA language adapter exists for this file type yet.");
  if (!language.buildable) return fail(language, `${language.name} does not have a direct Build action.`);

  const platform = report.platform;
  const source = quote(path);
  const name = baseName(path);

  switch (language.id) {
    case "python": {
      const python = toolCommand(report, "python");
      return python
        ? ok("build", language, `${python} -m py_compile ${source}`, ["python"], "Check Python syntax")
        : fail(language, "Python runtime not detected.", ["python"]);
    }
    case "javascript": {
      const node = toolCommand(report, "node");
      return node
        ? ok("build", language, `${node} --check ${source}`, ["node"], "Check JavaScript syntax")
        : fail(language, "Node.js runtime not detected.", ["node"]);
    }
    case "typescript": {
      const tsc = toolCommand(report, "tsc");
      return tsc
        ? ok("build", language, `${tsc} --pretty false --noEmit ${source}`, ["tsc"], "Type-check TypeScript file")
        : fail(language, "TypeScript compiler not detected on PATH.", ["tsc"]);
    }
    case "c":
    case "cpp": {
      const compiler = language.id === "c"
        ? firstTool(report, ["gcc", "clang"])
        : firstTool(report, ["g++", "clang++"]);
      if (!compiler) return fail(language, `${language.name} compiler not detected.`, language.id === "c" ? ["gcc", "clang"] : ["g++", "clang++"]);
      const output = outputPath(platform, name);
      const compile = `${compiler.command} ${source} -o ${quote(output)}`;
      return ok("build", language, compilePlan(platform, compile), [compiler.id], `Build ${language.name}`);
    }
    case "java": {
      const javac = toolCommand(report, "javac");
      if (!javac) return fail(language, "Java compiler not detected.", ["javac"]);
      const directory = ".xenra-build/java";
      const prepare = prepareBuildDir(platform, directory);
      const compile = `${javac} -d ${quote(directory)} ${source}`;
      const command = platform === "win32" ? `${prepare}; ${compile}` : `${prepare} && ${compile}`;
      return ok("build", language, command, ["javac"], "Compile Java");
    }
    case "csharp": {
      const dotnet = toolCommand(report, "dotnet");
      if (dotnet) return ok("build", language, `${dotnet} build`, ["dotnet"], "Build .NET project");
      const csc = toolCommand(report, "csc");
      if (csc && platform === "win32") {
        const output = outputPath(platform, name);
        const compile = `${csc} /nologo /out:${quote(output)} ${source}`;
        return ok("build", language, compilePlan(platform, compile), ["csc"], "Compile C#");
      }
      return fail(language, "No usable .NET SDK or C# compiler detected.", ["dotnet", "csc"]);
    }
    case "go": {
      const go = toolCommand(report, "go");
      if (!go) return fail(language, "Go toolchain not detected.", ["go"]);
      const output = outputPath(platform, name);
      return ok("build", language, compilePlan(platform, `${go} build -o ${quote(output)} ${source}`), ["go"], "Build Go");
    }
    case "rust": {
      const rustc = toolCommand(report, "rustc");
      if (!rustc) return fail(language, "Rust compiler not detected.", ["rustc"]);
      const output = outputPath(platform, name);
      return ok("build", language, compilePlan(platform, `${rustc} ${source} -o ${quote(output)}`), ["rustc"], "Build Rust");
    }
    case "php": {
      const php = toolCommand(report, "php");
      return php
        ? ok("build", language, `${php} -l ${source}`, ["php"], "Check PHP syntax")
        : fail(language, "PHP runtime not detected.", ["php"]);
    }
    case "ruby": {
      const ruby = toolCommand(report, "ruby");
      return ruby
        ? ok("build", language, `${ruby} -c ${source}`, ["ruby"], "Check Ruby syntax")
        : fail(language, "Ruby runtime not detected.", ["ruby"]);
    }
    case "shell": {
      const bash = toolCommand(report, "bash");
      return bash
        ? ok("build", language, `${bash} -n ${source}`, ["bash"], "Check shell syntax")
        : fail(language, "Bash runtime not detected.", ["bash"]);
    }
    case "assembly": {
      const ext = extensionOf(path);
      if (ext === "asm") {
        const nasm = toolCommand(report, "nasm");
        if (!nasm) return fail(language, "NASM assembler not detected.", ["nasm"]);
        const object = platform === "win32" ? `.xenra-build\\${name}.obj` : `.xenra-build/${name}.o`;
        const format = platform === "win32" ? "win64" : platform === "darwin" ? "macho64" : "elf64";
        return ok("build", language, compilePlan(platform, `${nasm} -f ${format} ${source} -o ${quote(object)}`), ["nasm"], "Assemble NASM source");
      }
      const driver = firstTool(report, ["gcc", "clang"]);
      if (!driver) return fail(language, "GCC or Clang not detected.", ["gcc", "clang"]);
      const output = outputPath(platform, name);
      return ok("build", language, compilePlan(platform, `${driver.command} ${source} -o ${quote(output)}`), [driver.id], "Assemble and link Assembly");
    }
    default:
      return fail(language, `${language.name} does not yet have a Build adapter.`);
  }
}
