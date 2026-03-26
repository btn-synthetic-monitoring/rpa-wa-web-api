// src/services/wa.service.ts

import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js'
import logger from '@/config/logger';
import type { TClientStatus } from '@/types';
import QRCode from 'qrcode';
import { handleStatusRequest } from '@/handlers/status.handler';
import { handleSuccessReport } from '@/handlers/report.handler';

const DEFAULT_PUPPETEER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const PUPPETEER_ARGS = process.env.PUPPETEER_ARGS
    ? process.env.PUPPETEER_ARGS.split(',').map((arg) => arg.trim()).filter(Boolean)
    : DEFAULT_PUPPETEER_ARGS;
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
const WA_WEB_VERSION = process.env.WA_WEB_VERSION || '2.3000.1017054665';
const WA_WEB_VERSION_REMOTE_PATH = process.env.WA_WEB_VERSION_REMOTE_PATH || 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html';
const ALLOWED_GROUP_IDS = process.env.ALLOWED_GROUP_IDS
    ? process.env.ALLOWED_GROUP_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : [];
type TChatLite = { id: string; name: string; unreadCount: number; timestamp: number; isGroup: boolean };

class WaService {
    private client: Client;
    private status: TClientStatus = 'UNINITIALIZED';
    private qrCode: string | null = null;
    private readonly allowedGroupIds: Set<string>;
    private readonly processedMessageIds = new Map<string, number>();


    constructor() {
        this.allowedGroupIds = new Set(ALLOWED_GROUP_IDS);

        this.client = new Client({
            puppeteer: {
                args: PUPPETEER_ARGS,
                ...(PUPPETEER_EXECUTABLE_PATH ? { executablePath: PUPPETEER_EXECUTABLE_PATH } : {})
            },
            webVersion: WA_WEB_VERSION,
            webVersionCache: {
                type: 'remote',
                remotePath: WA_WEB_VERSION_REMOTE_PATH,
                strict: false
            },
            authStrategy: new LocalAuth({
                clientId: 'wa-api-session',
            })
        })

        // --- Event Listeners Existing ---
        this.client.on('qr', (qr) => {
            logger.warn('QR RECEIVED. Scan this QR code to log in.');
            this.qrCode = qr;
            this.status = 'LOADING';
        });

        this.client.on('ready', () => {
            logger.info('Client is ready! WhatsApp is fully connected.');
            this.status = 'READY';
            this.qrCode = null;
        });

        this.client.on('authenticated', () => {
            logger.info('Client authenticated successfully.');
            this.status = 'AUTHENTICATED';
        });

        this.client.on('change_state', (state) => {
            logger.info({ state }, 'WhatsApp state changed.');
            if (state === 'CONNECTED') {
                this.status = 'READY';
                this.qrCode = null;
            }
        });

        this.client.on('loading_screen', (percent, message) => {
            logger.info({ percent, message }, 'WhatsApp loading screen progress.');
        });

        this.client.on('disconnected', (reason) => {
            logger.error({ reason }, 'Client disconnected! Attempting to re-initialize.');
            this.status = 'DISCONNECTED';
            this.client.initialize();
        });

        this.client.on('auth_failure', (msg) => {
            logger.fatal({ message: msg }, 'AUTHENTICATION FAILURE: Session corrupted or expired.');
            this.status = 'DISCONNECTED';
        });


        this.client.on('message', async (msg) => {
            await this.handleIncomingEvent(msg, 'message');
        });

        this.client.on('message_create', async (msg) => {
            await this.handleIncomingEvent(msg, 'message_create');
        });
    }

    public async init() {
        this.status = 'LOADING';
        logger.info(
            { allowedGroups: this.allowedGroupIds.size > 0 ? Array.from(this.allowedGroupIds) : 'ALL_GROUPS' },
            'Starting WhatsApp Client initialization...'
        );
        await this.client.initialize();
        logger.info('WhatsApp Client process initiated.');
    }

    public getStatus(): TClientStatus { return this.status; }
    public getQrCode(): string | null { return this.qrCode; }

    public async generateQrImage(): Promise<Buffer | null> {
        if (this.qrCode) {
            const qrBuffer = await QRCode.toBuffer(this.qrCode, {
                type: 'png',
                errorCorrectionLevel: 'H',
                scale: 8,
            });
            return qrBuffer;
        }
        return null;
    }

    public async getAllContacts() {
        await this.ensureClientOperational();
        const contacts = await this.client.getContacts();
        return contacts.map(c => ({
            id: c.id._serialized,
            name: c.name || c.pushname || 'No Name',
            isMyContact: c.isMyContact,
            isGroup: c.isGroup,
            isUser: c.isUser
        })).filter(c => c.isUser);
    }

    public async getAllChats() {
        await this.ensureClientOperational();
        const chats = await this.getChatsSafe();
        return chats
            .filter((chat) => !chat.isGroup)
            .map((chat) => ({
                id: chat.id,
                name: chat.name,
                unreadCount: chat.unreadCount,
                lastMessageTimestamp: chat.timestamp,
            }));
    }

    public async getAllGroups() {
        await this.ensureClientOperational();
        const chats = await this.getChatsSafe();
        return chats
            .filter((chat) => chat.isGroup)
            .map((chat) => ({
                id: chat.id,
                name: chat.name,
                unreadCount: chat.unreadCount,
            }));
    }

    public async sendMessage(to: string, message: string) {
        await this.ensureClientOperational();
        const chatId = `${to}@c.us`;
        const result = await this.client.sendMessage(chatId, message, { sendSeen: false });
        return result;
    }

    public async sendMessageToGroup(groupId: string, message: string) {
        await this.ensureClientOperational();
        const result = await this.client.sendMessage(groupId, message, { sendSeen: false });
        return result;
    }

    public async sendUnifiedMessage(to: string, message: string | undefined, imageBase64: string | undefined, mentionIds: string[] = []) {
        await this.ensureClientOperational();
        let chatId = to.includes('@') ? to : `${to}@c.us`;
        let mentions: any[] = [];
        if (mentionIds && mentionIds.length > 0) {
            mentions = await Promise.all(mentionIds.map(async (id) => await this.client.getContactById(id.includes('@') ? id : `${id}@c.us`)));
        }
        const sendOptions: any = { mentions, sendSeen: false };
        if (imageBase64) {
            const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            const media = new MessageMedia('image/png', cleanBase64);
            if (message) sendOptions.caption = message;
            return await this.client.sendMessage(chatId, media, sendOptions);
        } else if (message) {
            return await this.client.sendMessage(chatId, message, sendOptions);
        }
    }

    private async processIncomingCommand(msg: any) {
        const body = this.getCommandBody(msg);
        if (!body.startsWith('/')) {
            return;
        }

        const chatId = this.resolveChatId(msg);
        const isGroupChat = chatId.endsWith('@g.us');
        logger.info(
            { command: body.split(/\s+/)[0]?.toLowerCase(), from: msg.from, to: msg.to, fromMe: !!msg.fromMe, chatId },
            'Incoming slash command detected.'
        );
        const parts = body.split(/\s+/);
        const command = parts[0].toLowerCase().split('@')[0];
        const args = parts.slice(1);
        const isFreeCommand = command === '/ping' || command === '/help';
        const commandKey = this.buildCommandKey(msg, chatId, command);

        if (!this.markMessageAsProcessed(commandKey)) {
            logger.debug({ command, chatId, commandKey }, 'Skipping duplicated command event.');
            return;
        }

        if (!isFreeCommand) {
            if (!isGroupChat) {
                logger.info({ command, chatId }, 'Ignoring non-group command.');
                return;
            }
            if (!this.isAllowedGroup(chatId)) {
                logger.info({ command, chatId }, 'Ignoring command from non-allowed group.');
                return;
            }
        } else if (isGroupChat && !this.isAllowedGroup(chatId)) {
            logger.info({ command, chatId }, 'Ignoring free command from non-allowed group.');
            return;
        }

        const normalizedMsg = { ...msg, from: chatId };

        try {
            await this.ensureClientOperational();
            switch (command) {
                case '/ping':
                    await this.client.sendMessage(chatId, 'pong', { quotedMessageId: msg.id._serialized, sendSeen: false });
                    break;

                case '/status':
                case '/dashboard':
                    await handleStatusRequest(this.client, normalizedMsg);
                    break;

                case '/report':
                    await handleSuccessReport(this.client, normalizedMsg, args);
                    break;

                case '/help':
                    await this.client.sendMessage(
                        chatId,
                        "BALE RPA - DAFTAR PERINTAH\n" +
                        "----------------------\n" +
                        "/status : Dashboard jaringan\n" +
                        "/report [target] [periode] : Laporan performa\n" +
                        "Target: critical, non-critical, login, dll\n" +
                        "Periode: daily, weekly\n" +
                        "----------------------",
                        { quotedMessageId: msg.id._serialized, sendSeen: false }
                    );
                    break;
            }
        } catch (error) {
            logger.error({ error, command, from: msg.from, to: msg.to, chatId }, 'Error processing whatsapp command');
        }
    }

    private resolveChatId(msg: any): string {
        const from = typeof msg?.from === 'string' ? msg.from : '';
        const to = typeof msg?.to === 'string' ? msg.to : '';
        const remote = typeof msg?.id?.remote === 'string' ? msg.id.remote : '';
        const rawRemote = typeof msg?._data?.id?.remote === 'string' ? msg._data.id.remote : '';
        const rawFrom = typeof msg?._data?.from === 'string' ? msg._data.from : '';

        const candidates = [from, to, remote, rawRemote, rawFrom];
        for (const candidate of candidates) {
            if (candidate.endsWith('@g.us')) {
                return candidate;
            }
        }
        if (from.endsWith('@g.us')) {
            return from;
        }
        if (to.endsWith('@g.us')) {
            return to;
        }
        return from || to || remote || rawRemote || rawFrom;
    }

    private normalizeCommandBody(value: unknown): string {
        if (typeof value !== 'string') {
            return '';
        }

        return value.replace(/[\u200e\u200f\u2060\u2066-\u2069]/g, '').trim();
    }

    private buildCommandKey(msg: any, chatId: string, command: string): string {
        const serialized = this.getMessageId(msg);
        const from = typeof msg?.from === 'string' ? msg.from : '';
        const to = typeof msg?.to === 'string' ? msg.to : '';
        const timestamp = msg?.timestamp ?? msg?._data?.t ?? '';
        const body = this.getCommandBody(msg);
        const baseKey = serialized || `${from}|${to}|${timestamp}|${body}`;
        return `${baseKey}:${chatId}:${command}`;
    }

    private getCommandBody(msg: any): string {
        const directBody = typeof msg?.body === 'string' ? msg.body : '';
        const rawBody = typeof msg?._data?.body === 'string' ? msg._data.body : '';
        return this.normalizeCommandBody(directBody || rawBody);
    }

    private isAllowedGroup(chatId: string): boolean {
        if (this.allowedGroupIds.size === 0) {
            return true;
        }
        return this.allowedGroupIds.has(chatId);
    }

    private async getChatsSafe(): Promise<TChatLite[]> {
        const pupPage = (this.client as any).pupPage;
        if (pupPage) {
            const storeChats = await this.extractChatsFromStore(pupPage);
            if (storeChats.length > 0) {
                return storeChats;
            }
        }

        try {
            const chats = await this.client.getChats();
            return chats.map((chat) => ({
                id: chat.id._serialized,
                name: chat.name || chat.id.user || chat.id._serialized,
                unreadCount: chat.unreadCount || 0,
                timestamp: chat.timestamp || 0,
                isGroup: !!chat.isGroup
            }));
        } catch (error: any) {
            if (pupPage) {
                const storeChats = await this.extractChatsFromStore(pupPage);
                if (storeChats.length > 0) {
                    logger.debug({ error: error?.message }, 'getChats() failed. Used Store chat extraction fallback.');
                    return storeChats;
                }
            }
            logger.warn({ error: error?.message }, 'Failed to retrieve chats from both getChats() and Store extraction.');
            throw error;
        }
    }

    private async ensureClientOperational(timeoutMs = 30000) {
        const startedAt = Date.now();
        let lastState: string | null = null;

        while ((Date.now() - startedAt) < timeoutMs) {
            if (this.status === 'READY') {
                return;
            }

            try {
                lastState = await this.client.getState();
                if (lastState === 'CONNECTED') {
                    this.status = 'READY';
                    return;
                }
            } catch {
                // ignore transient state read errors during bootstrap
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        throw new Error(`WhatsApp client not ready (status=${this.status}, state=${lastState || 'UNKNOWN'})`);
    }

    private async handleIncomingEvent(msg: any, sourceEvent: 'message' | 'message_create') {
        const chatId = this.resolveChatId(msg);
        const bodyPreview = this.getCommandBody(msg).slice(0, 80);
        if (chatId.endsWith('@g.us') && this.isAllowedGroup(chatId)) {
            logger.info(
                { sourceEvent, from: msg?.from, to: msg?.to, fromMe: !!msg?.fromMe, type: msg?.type, chatId, bodyPreview },
                'WhatsApp group event captured.'
            );
        }

        await this.processIncomingCommand(msg);
    }

    private getMessageId(msg: any): string {
        return msg?.id?._serialized || '';
    }

    private markMessageAsProcessed(messageId: string): boolean {
        if (this.processedMessageIds.has(messageId)) {
            return false;
        }

        const now = Date.now();
        this.processedMessageIds.set(messageId, now);

        if (this.processedMessageIds.size > 1000) {
            const cutoff = now - (5 * 60 * 1000);
            for (const [id, ts] of this.processedMessageIds.entries()) {
                if (ts < cutoff) {
                    this.processedMessageIds.delete(id);
                }
            }
        }

        return true;
    }

    private async extractChatsFromStore(pupPage: any): Promise<TChatLite[]> {
        try {
            return await pupPage.evaluate(() => {
                const w = window as any;
                const storeChats = w.Store?.Chat?.getModelsArray?.() || [];

                return storeChats
                    .map((chat: any) => {
                        const serializedId = chat?.id?._serialized || '';
                        const isGroupById = typeof serializedId === 'string' && serializedId.endsWith('@g.us');
                        const isGroup = typeof chat?.isGroup === 'boolean' ? chat.isGroup : isGroupById;
                        const name =
                            chat?.formattedTitle ||
                            chat?.name ||
                            chat?.contact?.formattedName ||
                            chat?.contact?.name ||
                            chat?.id?.user ||
                            serializedId;
                        const unreadCount = Number.isFinite(chat?.unreadCount) ? chat.unreadCount : 0;
                        const timestamp = Number.isFinite(chat?.timestamp) ? chat.timestamp : 0;

                        return {
                            id: serializedId,
                            name,
                            unreadCount,
                            timestamp,
                            isGroup
                        };
                    })
                    .filter((chat: any) => Boolean(chat.id));
            });
        } catch (error: any) {
            logger.debug({ error: error?.message }, 'Store chat extraction failed.');
            return [];
        }
    }
}

export const waService = new WaService()
