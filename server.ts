
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(cors());
    app.use(express.json());

    // Google TTS Proxy to bypass CORS
    app.get('/api/proxy/google-tts', async (req, res) => {
        const { text, lang } = req.query;
        if (!text || !lang) {
            return res.status(400).send('Missing text or lang');
        }

        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text as string)}&tl=${lang}&client=tw-ob`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://translate.google.com/'
                }
            });

            if (!response.ok) {
                console.error(`Google TTS error: ${response.status} ${response.statusText}`);
                return res.status(response.status).send('Google TTS error');
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            res.set('Content-Type', 'audio/mpeg');
            res.send(buffer);
        } catch (error) {
            console.error('Proxy error:', error);
            res.status(500).send('Internal Server Error');
        }
    });

    // Vite middleware setup
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
