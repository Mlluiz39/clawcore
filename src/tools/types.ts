// src/tools/types.ts

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolDefinition["parameters"];

  /** Returns the OpenAI-compatible function definition */
  getDefinition(): { type: "function"; function: ToolDefinition } {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;
}
