import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { MessageMedia } from 'whatsapp-web.js';
import logger from '@/config/logger';

const execPromise = promisify(exec);

const PYTHON_PATH = process.env.STATUS_PYTHON_PATH || process.env.PYTHON_PATH || 'C:\\Repo\\bale-rpa-new\\.venv\\Scripts\\python.exe';
const SCRIPT_PATH = process.env.STATUS_SCRIPT_PATH || 'C:\\Repo\\bale-rpa-new\\monitor\\get_status_report.py';
const IMG_PATH = process.env.STATUS_IMAGE_PATH || 'C:\\Repo\\bale-rpa-new\\monitor\\report\\dashboard_report.png';

export async function handleStatusRequest(client: any, msg: any) {
    try {
        logger.info({ scriptPath: SCRIPT_PATH }, 'Executing status report script...');
        
        const { stdout, stderr } = await execPromise(`"${PYTHON_PATH}" "${SCRIPT_PATH}"`, {
            maxBuffer: 1024 * 1024 
        });

        if (stderr) logger.warn(`Python Stderr: ${stderr}`);

        const reportText = stdout.split('IMAGE_PATH:')[0].trim();

        if (fs.existsSync(IMG_PATH)) {
            const media = MessageMedia.fromFilePath(IMG_PATH);

            await client.sendMessage(msg.from, media, { 
                caption: reportText || 'Bale RPA System Status',
                quotedMessageId: msg.id._serialized,
                sendSeen: false
            });
            
            logger.info('Dashboard replied successfully using sendMessage.');
        } else {
            await client.sendMessage(msg.from, reportText || 'Gagal mendapatkan data status.', {
                quotedMessageId: msg.id._serialized,
                sendSeen: false
            });
            logger.warn('Image not found, replied with text only.');
        }
        
    } catch (error: any) {
        console.error('--- DETAIL ERROR ---');
        console.error(error);
        
        logger.error({ 
            msg: error.message,
            stack: error.stack
        }, 'Failed to execute status handler');

        try {
            await client.sendMessage(msg.from, 'Sistem gagal men-generate dashboard. Silakan cek koneksi database.', {
                quotedMessageId: msg.id._serialized,
                sendSeen: false
            });
        } catch (e) {
            logger.error('Could not even send failure message');
        }
    }
}
