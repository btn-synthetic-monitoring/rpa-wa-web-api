import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { MessageMedia } from 'whatsapp-web.js';
import logger from '@/config/logger';

const execPromise = promisify(exec);

const PYTHON_PATH = process.env.REPORT_PYTHON_PATH || process.env.PYTHON_PATH || 'C:\\Repo\\bale-rpa-new\\.venv\\Scripts\\python.exe';
const SCRIPT_PATH = process.env.REPORT_SCRIPT_PATH || 'C:\\Repo\\bale-rpa-new\\monitor\\get_success_report.py';
const PROJECT_ROOT = process.env.REPORT_PROJECT_ROOT || 'C:\\Repo\\bale-rpa-new';

export async function handleSuccessReport(client: any, msg: any, args: string[]) {
    try {
        const target = args[0] || 'critical';
        const timeframe = args[1] || 'daily';

        logger.info(`Requesting Supabase report for ${target} (${timeframe})`);
        
        // Menambahkan parameter cwd agar skrip dijalankan dari root proyek
        const { stdout, stderr } = await execPromise(
            `"${PYTHON_PATH}" "${SCRIPT_PATH}" ${target} ${timeframe}`,
            { cwd: PROJECT_ROOT }
        );

        if (stderr) logger.warn(`Python Stderr: ${stderr}`);

        const outputParts = stdout.split('IMAGE_PATH:');
        const reportText = outputParts[0].trim();
        const imgPath = outputParts[1]?.trim();

        if (imgPath && fs.existsSync(imgPath)) {
            const media = MessageMedia.fromFilePath(imgPath);
            await client.sendMessage(msg.from, media, { 
                caption: reportText,
                quotedMessageId: msg.id._serialized,
                sendSeen: false
            });
        } else {
            await client.sendMessage(msg.from, reportText || "Data tidak ditemukan.", { 
                quotedMessageId: msg.id._serialized,
                sendSeen: false
            });
        }
    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to generate Supabase report');
        await client.sendMessage(msg.from, "Gagal mengambil laporan.", {
            quotedMessageId: msg.id._serialized,
            sendSeen: false
        });
    }
}
