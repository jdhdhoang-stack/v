import { WSS_URL } from '../src/constants';

interface SynthesizeOptions {
    text: string;
    speaker: string;
    token: string;
    appkey: string;
}

// Helper to decode base64 string to Uint8Array for browser environment
const b64decode = (str: string): Uint8Array => {
    try {
        const binary_string = window.atob(str);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("Base64 decode error:", e);
        return new Uint8Array(0);
    }
};

// Custom Error for better debugging
class TTSError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TTSError";
  }
}

export const synthesizeChunk = (options: SynthesizeOptions, signal?: AbortSignal): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new Error('Aborted'));
        }

        const ws = new WebSocket(WSS_URL);
        const audioChunks: Uint8Array[] = [];
        let isSettled = false;
        let timeoutId: number;

        const onAbort = () => {
            settle(reject, new Error('Aborted'));
        };

        if (signal) {
            signal.addEventListener('abort', onAbort);
        }

        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close();
            }
        };
        
        const settle = (resolver: (value?: any) => void, value?: any) => {
            if (!isSettled) {
                isSettled = true;
                cleanup();
                resolver(value);
            }
        };

        timeoutId = window.setTimeout(() => {
            settle(reject, new TTSError("Tổng hợp TTS đã hết thời gian sau 1 phút."));
        }, 60000);

        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            const payload = {
                text: options.text,
                speaker: options.speaker,
                audio_config: {
                    bit_rate: 64000,
                    sample_rate: 24000,
                    format: "mp3",
                },
            };

            const frame = {
                appkey: options.appkey,
                token: options.token,
                namespace: "TTS",
                event: "StartTask",
                version: "sdk_v1",
                payload: JSON.stringify(payload),
            };

            ws.send(JSON.stringify(frame));
        };

        ws.onmessage = async (event: MessageEvent) => {
            if (isSettled) return;

            // Handle binary audio data directly (as ArrayBuffer since we set binaryType)
            if (event.data instanceof ArrayBuffer) {
                audioChunks.push(new Uint8Array(event.data));
                return;
            }
            
            // Fallback for Blob just in case
            if (event.data instanceof Blob) {
                const arrayBuffer = await event.data.arrayBuffer();
                audioChunks.push(new Uint8Array(arrayBuffer));
                return;
            }

            // Handle JSON-based messages
            if (typeof event.data === 'string') {
                try {
                    const data = JSON.parse(event.data);
                    const eventType = data.event;
                    const payload = data.payload;

                    // Case 1: Direct URL received. This is a final success state.
                    if (payload && typeof payload === "object" && payload.audio_url) {
                       try {
                           const response = await fetch(payload.audio_url, { signal });
                           if (!response.ok) {
                               throw new TTSError(`Tải xuống URL âm thanh thất bại: ${response.statusText}`);
                           }
                           const audioBlob = await response.blob();
                           const audioUrl = URL.createObjectURL(audioBlob);
                           settle(resolve, audioUrl);
                       } catch(err: any) {
                           if (err.name === 'AbortError' || signal?.aborted) {
                               settle(reject, new Error('Aborted'));
                           } else {
                               settle(reject, err);
                           }
                       }
                       return;
                    }

                    // Case 2: Base64 encoded audio chunk received.
                    if (eventType === 'AudioChunk' && payload?.data) {
                        audioChunks.push(b64decode(payload.data));
                        return;
                    }
                    
                    // Case 3: Task finished signal. 
                    if (['TaskFinished', 'Completed', 'Finish'].includes(eventType)) {
                        // If we have chunks, we can settle now. 
                        // But wait a tiny bit to see if more chunks arrive or connection closes.
                        setTimeout(() => {
                            if (!isSettled && audioChunks.length > 0) {
                                const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
                                const audioUrl = URL.createObjectURL(audioBlob);
                                settle(resolve, audioUrl);
                            }
                        }, 100);
                        return;
                    }

                    // Case 4: Explicit error from the server.
                    if (['Error', 'Failed'].includes(eventType)) {
                        console.error('TTS API Error:', data);
                        settle(reject, new TTSError(payload?.message || 'Tổng hợp TTS thất bại.'));
                        return;
                    }

                } catch (e) {
                    console.warn('Received non-JSON message or failed to parse:', event.data, e);
                }
            }
        };

        ws.onerror = (errorEvent: Event) => {
            console.error("WebSocket Error:", errorEvent);
            settle(reject, new TTSError("Kết nối WebSocket thất bại. Dịch vụ có thể đang giới hạn yêu cầu hoặc gặp sự cố."));
        };

        ws.onclose = (closeEvent: CloseEvent) => {
            // This is the final step. If we haven't settled yet, we resolve or reject based on the received chunks.
             if (!isSettled) {
                if (audioChunks.length > 0) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    settle(resolve, audioUrl);
                } else {
                     // If connection closes without any audio data, then it's an error.
                     settle(reject, new TTSError(`Tác vụ hoàn thành nhưng không nhận được dữ liệu âm thanh.`));
                }
            }
        };
    });
};