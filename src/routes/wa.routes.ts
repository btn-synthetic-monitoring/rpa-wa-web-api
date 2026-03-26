// src/routes/wa.routes.ts

import { Router } from 'express';
import {
    getStatus,
    getQrCode,
    sendMessage,
    getContacts,
    getChats,
    getGroups,
    sendMessageGroup,
    sendUnified
} from '../controllers/wa.controller';

const router = Router();

// Endpoint Status dan QR
router.get('/status', getStatus);
router.get('/qr', getQrCode);

// Endpoint Kirim Pesan
router.post('/send-message', sendMessage);
router.post('/send-message-group', sendMessageGroup);
router.post('/send', sendUnified);

// --- Data Retrieval Endpoints ---
router.get('/contacts', getContacts);
router.get('/chats', getChats);
router.get('/groups', getGroups);


export default router;