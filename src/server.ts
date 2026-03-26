import 'dotenv/config'

import express from 'express';
import waRoutes from './routes/wa.routes';
import { waService } from './services/wa.service';
import logger from './config/logger';

const app = express();
const PORT = process.env.APP_PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));    
app.use('/api/whatsapp', waRoutes);

const startServer = async () => {
    await waService.init();

    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
};

process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
});

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
