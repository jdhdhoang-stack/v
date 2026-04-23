
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

        // Try different clients if one fails. gtx is usually the most stable for non-browser use.
        const clients = ['gtx', 'tw-ob', 't'];
        let lastError = null;

        for (const client of clients) {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text as string)}&tl=${lang}&client=${client}`;
            
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://translate.google.com/',
                        'Accept': '*/*',
                        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
                    }
                });

                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    res.set('Content-Type', 'audio/mpeg');
                    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                    return res.send(buffer);
                }
                
                lastError = `Status: ${response.status} with client ${client}`;
                if (response.status === 429) {
                    // If rate limited, wait a bit before trying next client
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (error: any) {
                lastError = error.message;
            }
        }

        console.error('Final Proxy error:', lastError);
        res.status(500).send(`Google TTS error: ${lastError}`);
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
