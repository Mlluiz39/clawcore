import { exec } from "child_process";
import { promisify } from "util";
import { BaseTool, ToolResult } from "./types";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

export class RunCommandTool extends BaseTool {
  name = "run_command";
  description = "Executes a shell command on the host system. Use this to run gogcli commands or any other terminal commands needed.";
  
  parameters = {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute, e.g., 'gog auth list' or 'ls -la'.",
      },
    },
    required: ["command"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    if (!command) {
      return { output: "Error: No command provided", isError: true };
    }

    try {
      logger.info("Executing command via tool", { command });
      // Execute with a reasonable timeout so the agent doesn't hang forever
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      
      let output = stdout;
      if (stderr) {
        output += `\n[STDERR]:\n${stderr}`;
      }
      
      return { output: output.trim() || "Command executed successfully (no output)." };
    } catch (error: any) {
      logger.warn("Command execution failed", { command, error: error.message });
      return { 
        output: `Error executing command: ${error.message}\n${error.stdout ? `[STDOUT]:\n${error.stdout}` : ''}\n${error.stderr ? `[STDERR]:\n${error.stderr}` : ''}`.trim(), 
        isError: true 
      };
    }
  }
}
