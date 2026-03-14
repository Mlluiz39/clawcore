import { BaseTool, ToolResult } from "./types";
import { WhatsAppClient } from "../utils/whatsapp-client";

/**
 * WhatsApp integration tool for ClawCore.
 * Allows the agent to login/init WhatsApp, send messages, and check connection status.
 */
export class WhatsAppTool extends BaseTool {
  name = "whatsapp_tool";
  description = "Interacts with WhatsApp. Can login (QR Code), send messages, and check status.";
  parameters = {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: "The action to perform: 'login', 'send_message', 'list_chats', 'read_messages', or 'status'",
      },
      jid: {
        type: "string",
        description: "The recipient's phone number or JID. Required for 'send_message' and 'read_messages'.",
      },
      text: {
        type: "string",
        description: "The text content. Required for 'send_message'.",
      },
      limit: {
        type: "number",
        description: "Number of items to return. Defaults to 5 for messages, 10 for chats.",
      },
    },
    required: ["action"],
  };

  async execute(args: { action: string; jid?: string; text?: string; limit?: number }): Promise<ToolResult> {
    const client = WhatsAppClient.getInstance();

    try {
      switch (args.action) {
        case "login":
          await client.init();
          const alreadyConnected = await client.isConnected();
          if (alreadyConnected) {
            return { output: "WhatsApp is already connected." };
          }
          return { 
            output: "WhatsApp initialization started. QR code is in server logs if needed." 
          };

        case "send_message":
          if (!args.jid || !args.text) {
            return { output: "Error: 'jid' and 'text' required.", isError: true };
          }
          await client.sendMessage(args.jid, args.text);
          return { output: `Message sent to ${args.jid}` };

        case "list_chats":
          const chats = await client.listChats(args.limit);
          const chatList = chats.map((c: any) => `- ${c.id} (${c.name || "Sem nome"})`).join("\n");
          return { output: `Recent WhatsApp Chats:\n${chatList || "No chats found."}` };

        case "read_messages":
          if (!args.jid) {
            return { output: "Error: 'jid' required to read messages.", isError: true };
          }
          const messages = await client.getMessages(args.jid, args.limit);
          const msgList = messages.map((m: any) => {
            const sender = m.key.fromMe ? "Eu" : "Eles";
            const content = m.message?.conversation || m.message?.extendedTextMessage?.text || "[Mídia/Outro]";
            return `[${sender}] ${content}`;
          }).join("\n");
          return { output: `Recent messages for ${args.jid}:\n${msgList || "No messages found."}` };

        case "status":
          const connected = await client.isConnected();
          return { output: `WhatsApp status: ${connected ? "Connected" : "Disconnected"}` };

        default:
          return { output: `Unknown action '${args.action}'.`, isError: true };
      }
    } catch (error: any) {
      console.error("[WhatsAppTool] Error:", error);
      return { output: `WhatsApp error: ${error.message}`, isError: true };
    }
  }
}
