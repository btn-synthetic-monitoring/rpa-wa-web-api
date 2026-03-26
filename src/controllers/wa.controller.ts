import type { Request, Response } from 'express';
import { waService } from '../services/wa.service';
import logger from '../config/logger';

// --- Core Endpoints (Status, QR, Send Message) ---

export const getStatus = (req: Request, res: Response) => {
    try {
        const status = waService.getStatus();
        res.status(200).json({ status, message: `WhatsApp client status is ${status}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
    }
};

export const getQrCode = async (req: Request, res: Response) => {
    try {
        const status = waService.getStatus();
        if (status === 'AUTHENTICATED' || status === 'READY') {
            return res.status(200).json({
                qrCode: null,
                message: 'Client is already authenticated or ready. No QR code needed.'
            });
        }

        const qrBuffer = await waService.generateQrImage();

        if (qrBuffer) {
            logger.info('Sending QR code image response.');
            res.setHeader('Content-Type', 'image/png');
            res.status(200).send(qrBuffer);
        } else {
            res.status(200).json({
                qrCode: null,
                message: 'QR code not yet generated or client is connecting. Try again soon.'
            });
        }
    } catch (error: any) {
        logger.error({ error: error.message }, 'API Error: Failed to generate or send QR code.');
        res.status(500).json({ success: false, error: 'Internal server error while processing QR code.' });
    }
};

export const sendMessage = async (req: Request, res: Response) => {
    const { to, message } = req.body;
    if (!to || !message) {
        logger.warn({ body: req.body }, 'Bad Request: Missing "to" or "message"');
        return res.status(400).json({ error: 'Missing "to" or "message" in request body.' });
    }
    try {
        await waService.sendMessage(to, message);
        logger.info({ to }, 'API Success: Message successfully processed.');
        res.status(200).json({ success: true, message: `Message sent to ${to}` });
    } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack, to }, 'API Error: Failed to send message.');
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Mendapatkan daftar semua kontak di akun WA.
 */
export const getContacts = async (req: Request, res: Response) => {
    try {
        const contacts = await waService.getAllContacts();
        res.status(200).json({ success: true, count: contacts.length, data: contacts });
    } catch (error: any) {
        logger.error({ error: error.message }, 'API Error: Failed to get contacts.');
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Mendapatkan daftar semua chat personal.
 * (getChats() sudah ada, dipertahankan untuk kelengkapan)
 */
export const getChats = async (req: Request, res: Response) => {
    try {
        const chats = await waService.getAllChats();
        res.status(200).json({ success: true, count: chats.length, data: chats });
    } catch (error: any) {
        logger.error({ error: error.message }, 'API Error: Failed to get personal chats.');
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Mendapatkan daftar semua grup yang diikuti akun WA.
 */
export const getGroups = async (req: Request, res: Response) => {
    try {
        const groups = await waService.getAllGroups();
        // Respons mencakup jumlah data dan array data grup
        res.status(200).json({ success: true, count: groups.length, data: groups });
    } catch (error: any) {
        logger.error({ error: error.message }, 'API Error: Failed to get groups.');
        res.status(500).json({ success: false, error: error.message });
    }
};


export const sendMessageGroup = async (req: Request, res: Response) => {
    // Kita harapkan 'to' berisi ID Grup lengkap
    const { to: groupId, message } = req.body;

    if (!groupId || !message) {
        logger.warn({ body: req.body }, 'Bad Request: Missing "to" (Group ID) or "message" in group send request.');
        return res.status(400).json({ error: 'Missing "to" (Group ID) or "message" in request body.' });
    }

    try {
        await waService.sendMessageToGroup(groupId, message);
        logger.info({ groupId }, 'API Success: Group message successfully processed.');
        res.status(200).json({ success: true, message: `Message sent to group ID: ${groupId}` });
    } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack, groupId }, 'API Error: Failed to send group message.');
        // Mengembalikan error dari service
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Endpoint Unified: Kirim pesan ke Group/Personal dengan dukungan Gambar dan Mention.
 */
export const sendUnified = async (req: Request, res: Response) => {
    // to: nomor hp atau group ID
    // message: text pesan (opsional jika ada image)
    // image: base64 string (opsional jika ada message)
    // mentions: array of string nomor hp yang mau di-mention (opsional)
    const { to, message, image, mentions } = req.body;

    // VALIDASI: Wajib ada tujuan
    if (!to) {
        logger.warn('Bad Request: Missing "to" field.');
        return res.status(400).json({ error: 'Missing "to" field (phone number or group ID).' });
    }

    // VALIDASI: Wajib ada message ATAU image
    if (!message && !image) {
        logger.warn('Bad Request: Must provide either "message" or "image".');
        return res.status(400).json({ error: 'Payload must contain at least "message" (text) or "image" (base64).' });
    }

    try {
        await waService.sendUnifiedMessage(to, message, image, mentions);
        logger.info({ to }, 'API Success: Unified message sent.');
        res.status(200).json({ 
            success: true, 
            message: `Message sent to ${to}`,
            details: {
                hasText: !!message,
                hasImage: !!image,
                mentionsCount: mentions ? mentions.length : 0
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack, to }, 'API Error: Failed to send unified message.');
        res.status(500).json({ success: false, error: error.message });
    }
};