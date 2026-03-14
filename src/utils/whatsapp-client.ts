import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import pino from 'pino';

const logger = pino({ level: 'silent' });

export class WhatsAppClient {
  private static instance: WhatsAppClient;
  public sock: any;
  private isInitializing = false;

  // Manual In-Memory Store
  private _chats = new Map<string, any>();
  private _messages = new Map<string, any[]>();

  private constructor() {}

  public static getInstance(): WhatsAppClient {
    if (!WhatsAppClient.instance) {
      WhatsAppClient.instance = new WhatsAppClient();
    }
    return WhatsAppClient.instance;
  }

  async init() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      const authPath = path.join(process.cwd(), 'data/whatsapp-session');
      if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          console.log('\n--- WHATSAPP LOGIN REQUIRED ---');
          console.log('Scan the QR Code below to connect:');
          qrcode.generate(qr, { small: true });
          console.log('--------------------------------\n');
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('WhatsApp connection closed. Reconnecting:', shouldReconnect);
          this.isInitializing = false;
          if (shouldReconnect) {
            this.init();
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connection opened successfully!');
          this.isInitializing = false;
        }
      });

      // Track history sync
      this.sock.ev.on('messaging-history.set', (history: any) => {
        const { chats, messages } = history;
        chats?.forEach((chat: any) => this._chats.set(chat.id, { ...this._chats.get(chat.id), ...chat }));
        messages?.forEach((msg: any) => {
          const jid = msg.key.remoteJid;
          if (!this._messages.has(jid)) this._messages.set(jid, []);
          this._messages.get(jid)!.push(msg);
        });
        console.log(`[WhatsApp] History sync complete. Captured ${chats?.length || 0} chats and ${messages?.length || 0} messages.`);
      });

      // Simple store logic
      this.sock.ev.on('chats.upsert', (newChats: any[]) => {
        newChats.forEach(chat => this._chats.set(chat.id, { ...this._chats.get(chat.id), ...chat }));
      });
      
      this.sock.ev.on('messages.upsert', (m: any) => {
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            const jid = msg.key.remoteJid;
            if (!this._messages.has(jid)) this._messages.set(jid, []);
            const chatMsgs = this._messages.get(jid)!;
            chatMsgs.push(msg);
            if (chatMsgs.length > 50) chatMsgs.shift();

            if (!msg.key.fromMe && msg.message) {
              const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
              if (text) {
                console.log(`[WhatsApp] New message from ${jid}: ${text}`);
              }
            }
          }
        }
      });

    } catch (error) {
      console.error('Failed to initialize WhatsApp:', error);
      this.isInitializing = false;
    }
  }

  async listChats(limit = 10) {
    return Array.from(this._chats.values()).slice(0, limit);
  }

  async getMessages(jid: string, limit = 5) {
    return (this._messages.get(jid) || []).slice(-limit);
  }

  async sendMessage(jid: string, text: string) {
    if (!this.sock) throw new Error('WhatsApp not initialized. Use login tool first.');
    
    let target = jid;
    if (!jid.includes('@')) {
      target = `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    }

    return await this.sock.sendMessage(target, { text });
  }

  async isConnected(): Promise<boolean> {
    return this.sock?.user !== undefined;
  }
}
