// src/tools/create-file.ts
import fs from "fs";
import path from "path";
import { BaseTool, ToolDefinition, ToolResult } from "./types";

export class CreateFileTool extends BaseTool {
  name = "create_file";
  // Updated description to explicitly inform the agent where files are saved
  description = "Creates a file on the local filesystem. All files will be automatically saved inside the 'outputs/' folder to keep the project organized. Provide a relative filename like 'analysis.md'.";
  parameters: ToolDefinition["parameters"] = {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Relative filename for the file to create (e.g. 'report.md' -> becomes 'outputs/report.md')",
      },
      content: {
        type: "string",
        description: "The text content to write into the file",
      },
    },
    required: ["filePath", "content"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(args.filePath);
    const content = String(args.content);

    // Resolve relative to an 'outputs' directory
    const baseDir = path.resolve(process.cwd(), "outputs");
    
    // Resolve path inside the outputs folder, preventing directory traversal
    const safePath = path.basename(filePath) === filePath 
      ? path.resolve(baseDir, filePath)
      : path.resolve(baseDir, filePath.replace(/^(\.\.(\/|\\))+/, '')); // strip leading ../

    // Safety: don't allow writing outside outputs folder
    if (!safePath.startsWith(baseDir)) {
      return { output: `Security error: path "${filePath}" resolves outside the outputs directory.`, isError: true };
    }

    try {
      const dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(safePath, content, "utf-8");
      return { output: `File created successfully at: ${path.relative(process.cwd(), safePath)}` };
    } catch (err) {
      return { output: `Failed to create file: ${String(err)}`, isError: true };
    }
  }
}
