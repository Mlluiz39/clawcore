// src/tools/registry.ts
import { BaseTool, ToolResult } from "./types";
import { ToolDefinitionParam } from "../providers/types";
import { logger } from "../utils/logger";

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    logger.info("Tool registered", { name: tool.name });
  }

  getDefinitions(): ToolDefinitionParam[] {
    return Array.from(this.tools.values()).map((t) => t.getDefinition());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, argsJson: string): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: `Tool "${name}" not found in registry.`, isError: true };
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson);
    } catch {
      return {
        output: `Invalid JSON arguments for tool "${name}": ${argsJson}`,
        isError: true,
      };
    }

    try {
      logger.info("Executing tool", { name, args });
      const result = await tool.execute(args);
      logger.info("Tool result", { name, output: result.output.slice(0, 200) });
      return result;
    } catch (err) {
      const errorMsg = `Tool "${name}" threw an error: ${String(err)}`;
      logger.error("Tool execution error", { name, error: String(err) });
      return { output: errorMsg, isError: true };
    }
  }
}
