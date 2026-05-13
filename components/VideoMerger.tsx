
import React, { useState, useRef, useEffect } from 'react';
import { Video, Image as ImageIcon, Download, Loader2, X, Play, Pause, Film, Settings, Maximize2, Type, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BlurConfig {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    amount: number;
}

interface SubtitleConfig {
    fontSize: number;
    bottomMargin: number;
    color: string;
    shadow: boolean;
    enabled: boolean;
}

interface LogoConfig {
    enabled: boolean;
    scale: number;
    x: number;
    y: number;
    opacity: number;
}

interface WatermarkConfig {
    enabled: boolean;
    text: string;
    fontSize: number;
    x: number;
    y: number;
    color: string;
    opacity: number;
    floating: boolean;
}

import { ChunkJob } from '../src/types';

interface VideoMergerProps {
    audioUrl: string;
    chunks?: ChunkJob[];
    onClose?: () => void;
    initialBgType?: 'image' | 'video' | 'color';
    initialBgSource?: string | null;
    onBgChange?: (type: 'image' | 'video' | 'color', source: string | null) => void;
    onAudioChange?: (url: string, chunks: ChunkJob[]) => void;
}

const STORAGE_KEY_BLUR = 'vocalis_blur_config';
const STORAGE_KEY_SUBTITLE = 'vocalis_subtitle_config';
const STORAGE_KEY_LOGO = 'vocalis_logo_config';
const STORAGE_KEY_WATERMARK = 'vocalis_watermark_config';

export const VideoMerger: React.FC<VideoMergerProps> = ({ 
    audioUrl, chunks, onClose, 
    initialBgType = 'color', 
    initialBgSource = null,
    onBgChange,
    onAudioChange
}) => {
    const [bgType, setBgType] = useState<'image' | 'video' | 'color'>(initialBgType);
    const [bgSource, setBgSource] = useState<string | null>(initialBgSource);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [isRendering, setIsRendering] = useState(false);
    const [progress, setProgress] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'blur_subs' | 'branding'>('blur_subs');
    const [customChunks, setCustomChunks] = useState<ChunkJob[] | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    // Handle audio graph reset when background changes
    useEffect(() => {
        // Reset audio context cache if bgType changes to/from video
        // This ensures the next render/preview setup will recreate the nodes with correct connections
        audioNodesRef.current = null;
    }, [bgType]);

    const [bgAudioVolume, setBgAudioVolume] = useState(() => {
        const saved = localStorage.getItem('vocalis_bg_audio_volume');
        return saved ? parseFloat(saved) : 0.5; // Increased default to 50%
    });

    useEffect(() => {
        localStorage.setItem('vocalis_bg_audio_volume', bgAudioVolume.toString());
        if (audioNodesRef.current?.videoGain) {
            audioNodesRef.current.videoGain.gain.value = bgAudioVolume;
        }
    }, [bgAudioVolume]);

    const parseSrtToChunks = (srtText: string): ChunkJob[] => {
        const srtChunks: ChunkJob[] = [];
        const lines = srtText.replace(/\r\n/g, '\n').split('\n');
        
        let currentChunk: any = null;
        let pendingId = '';
        
        const parseTime = (timeStr: string) => {
            const parts = timeStr.replace(',', '.').trim().split(':');
            if (parts.length === 3) {
                const hours = parseFloat(parts[0]);
                const minutes = parseFloat(parts[1]);
                const seconds = parseFloat(parts[2]);
                return hours * 3600 + minutes * 60 + seconds;
            }
            return 0;
        };

        const timecodeRegex = /^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const timeMatch = line.match(timecodeRegex);
            if (timeMatch) {
                if (currentChunk) {
                    const textLines = currentChunk.text.split('\n');
                    if (textLines.length > 0 && /^\d+$/.test(textLines[textLines.length - 1].trim())) {
                        pendingId = textLines.pop()!.trim();
                        currentChunk.text = textLines.join('\n').trim();
                    }
                    srtChunks.push(currentChunk);
                }
                
                if (!pendingId && i > 0) {
                    const prevLine = lines[i-1].trim();
                    if (/^\d+$/.test(prevLine)) {
                        pendingId = prevLine;
                    }
                }

                currentChunk = {
                    id: pendingId || Math.random().toString(36).substring(2, 9),
                    text: '',
                    status: 'finished',
                    startTime: parseTime(timeMatch[1]),
                    endTime: parseTime(timeMatch[2])
                };
                pendingId = '';
            } else if (currentChunk) {
                currentChunk.text += (currentChunk.text ? '\n' : '') + line;
            }
        }
        
        if (currentChunk) {
            const textLines = currentChunk.text.split('\n');
            if (textLines.length > 0 && /^\d+$/.test(textLines[textLines.length - 1].trim()) && textLines.length > 1) {
                textLines.pop();
                currentChunk.text = textLines.join('\n').trim();
            }
            srtChunks.push(currentChunk);
        }

        return srtChunks;
    };
    
    // Blur Settings
    const [blurConfig, setBlurConfig] = useState<BlurConfig>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_BLUR);
        return saved ? JSON.parse(saved) : { enabled: false, x: 10, y: 10, width: 20, height: 10, amount: 15 };
    });

    // Subtitle Settings
    const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_SUBTITLE);
        return saved ? JSON.parse(saved) : { fontSize: 48, bottomMargin: 100, color: '#ffffff', shadow: true, enabled: true };
    });

    // Logo Settings
    const [logoSource, setLogoSource] = useState<string | null>(() => localStorage.getItem('vocalis_logo_source'));
    const [logoConfig, setLogoConfig] = useState<LogoConfig>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_LOGO);
        return saved ? JSON.parse(saved) : { enabled: false, scale: 20, x: 5, y: 5, opacity: 1 };
    });

    // Watermark Settings
    const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_WATERMARK);
        return saved ? JSON.parse(saved) : { enabled: false, text: '', fontSize: 24, x: 95, y: 95, color: '#ffffff', opacity: 0.5, floating: false };
    });

    const displayChunks = customChunks || chunks || [];

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);
    const requestRef = useRef<number>();
    const isLoopingRef = useRef(false);

    const audioNodesRef = useRef<{ ctx: AudioContext, source: MediaElementAudioSourceNode, dest: MediaStreamAudioDestinationNode, videoGain?: GainNode } | null>(null);
    const logoImageRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_BLUR, JSON.stringify(blurConfig));
    }, [blurConfig]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SUBTITLE, JSON.stringify(subtitleConfig));
    }, [subtitleConfig]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_LOGO, JSON.stringify(logoConfig));
    }, [logoConfig]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_WATERMARK, JSON.stringify(watermarkConfig));
    }, [watermarkConfig]);

    useEffect(() => {
        if (logoSource) {
            localStorage.setItem('vocalis_logo_source', logoSource);
            const img = new Image();
            img.onload = () => {
                logoImageRef.current = img;
            };
            img.src = logoSource;
        } else {
            localStorage.removeItem('vocalis_logo_source');
            logoImageRef.current = null;
        }
    }, [logoSource]);

    useEffect(() => {
        onBgChange?.(bgType, bgSource);
    }, [bgType, bgSource]);

    useEffect(() => {
        if (bgType === 'image' && bgSource) {
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
                setImageLoaded(true);
            };
            img.onerror = () => {
                console.error("Image failed to load:", bgSource);
                setImageLoaded(false);
            };
            img.src = bgSource;
        } else {
            setImageLoaded(false);
        }
    }, [bgSource, bgType]);

    useEffect(() => {
        if (bgType === 'video' && bgSource && videoRef.current) {
            videoRef.current.src = bgSource;
            videoRef.current.load();
            
            videoRef.current.onloadedmetadata = () => {
                if (videoRef.current && (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0)) {
                    alert("Video có thể sử dụng định dạng mà trình duyệt không hỗ trợ (ví dụ: HEVC/H.265). Khung hình có thể sẽ bị đen hoặc không hiển thị. Vui lòng thử dùng file MP4 chuẩn (H.264).");
                }
            };

            videoRef.current.currentTime = 0.5; // Start a bit later to avoid potential black frames at start
            videoRef.current.onseeked = () => {
                // Ensure first frame is drawn
            };
        }
    }, [bgSource, bgType]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Revoke old URL if exists to prevent memory leaks
        if (bgSource && bgSource.startsWith('blob:')) {
            URL.revokeObjectURL(bgSource);
        }

        const url = URL.createObjectURL(file);
        const accept = e.target.accept || '';
        
        if (accept.includes('image')) {
            setBgType('image');
            setBgSource(url);
        } else if (accept.includes('video')) {
            setBgType('video');
            setBgSource(url);
        } else {
            // Fallback
            const type = file.type || '';
            const name = file.name.toLowerCase();
            if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                setBgType('image');
                setBgSource(url);
            } else if (type.startsWith('video/') || name.match(/\.(mp4|webm|ogg|mov)$/)) {
                setBgType('video');
                setBgSource(url);
            }
        }
    };

    const layoutRef = useRef<{ 
        drawWidth: number, 
        drawHeight: number, 
        offsetX: number, 
        offsetY: number,
        bgWidth: number,
        bgHeight: number
    } | null>(null);

    const updateLayout = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let bgWidth = 0;
        let bgHeight = 0;

        if (bgType === 'image' && bgImageRef.current) {
            bgWidth = bgImageRef.current.naturalWidth;
            bgHeight = bgImageRef.current.naturalHeight;
        } else if (bgType === 'video' && videoRef.current) {
            bgWidth = videoRef.current.videoWidth;
            bgHeight = videoRef.current.videoHeight;
        }

        if (!bgWidth || !bgHeight) {
            layoutRef.current = null;
            return;
        }

        const canvasRatio = canvas.width / canvas.height;
        const bgRatio = bgWidth / bgHeight;
        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
        
        if (bgType === 'image') {
            // object-cover behavior
            if (bgRatio > canvasRatio) {
                drawHeight = canvas.height;
                drawWidth = canvas.height * bgRatio;
                offsetX = (canvas.width - drawWidth) / 2;
            } else {
                drawWidth = canvas.width;
                drawHeight = canvas.width / bgRatio;
                offsetY = (canvas.height - drawHeight) / 2;
            }
        } else {
            // object-contain behavior
            if (bgRatio > canvasRatio) {
                drawWidth = canvas.width;
                drawHeight = canvas.width / bgRatio;
                offsetY = (canvas.height - drawHeight) / 2;
            } else {
                drawHeight = canvas.height;
                drawWidth = canvas.height * bgRatio;
                offsetX = (canvas.width - drawWidth) / 2;
            }
        }

        layoutRef.current = { drawWidth, drawHeight, offsetX, offsetY, bgWidth, bgHeight };
    };

    useEffect(() => {
        if (bgType === 'image' && imageLoaded) {
            updateLayout();
        }
    }, [imageLoaded, bgType]);

    useEffect(() => {
        if (bgType === 'video' && bgSource) {
            const vid = videoRef.current;
            if (vid) {
                const checkMetadata = () => {
                    if (vid.videoWidth > 0) {
                        updateLayout();
                        vid.removeEventListener('loadedmetadata', checkMetadata);
                    }
                };
                vid.addEventListener('loadedmetadata', checkMetadata);
            }
        }
    }, [bgSource, bgType]);

    const lastChunkIndexRef = useRef(0);

    const render = () => {
        if (!isLoopingRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: false }); // Optimization: no alpha
        if (!canvas || !ctx) return;

        // Draw Background
        const layout = layoutRef.current;
        if (layout) {
            const source = bgType === 'image' ? bgImageRef.current : videoRef.current;
            if (source) {
                ctx.drawImage(source as CanvasImageSource, layout.offsetX, layout.offsetY, layout.drawWidth, layout.drawHeight);
            }
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Apply Blur
        if (blurConfig.enabled && blurConfig.amount > 0 && layout) {
            const bx = (blurConfig.x / 100) * canvas.width;
            const by = (blurConfig.y / 100) * canvas.height;
            const bw = (blurConfig.width / 100) * canvas.width;
            const bh = (blurConfig.height / 100) * canvas.height;

            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, by, bw, bh);
            ctx.clip();
            
            ctx.filter = `blur(${blurConfig.amount}px)`;
            const source = bgType === 'image' ? bgImageRef.current : videoRef.current;
            if (source) {
                ctx.drawImage(source as CanvasImageSource, layout.offsetX, layout.offsetY, layout.drawWidth, layout.drawHeight);
            }
            ctx.restore();
            ctx.filter = 'none';
        }

        // Draw Logo
        if (logoConfig.enabled && logoImageRef.current) {
            const img = logoImageRef.current;
            const targetWidth = (logoConfig.scale / 100) * canvas.width;
            const targetHeight = (img.naturalHeight / img.naturalWidth) * targetWidth;
            
            const lx = (logoConfig.x / 100) * canvas.width;
            const ly = (logoConfig.y / 100) * canvas.height;
            
            ctx.save();
            ctx.globalAlpha = logoConfig.opacity;
            ctx.drawImage(img, lx, ly, targetWidth, targetHeight);
            ctx.restore();
        }

        const audio = audioRef.current;

        // Draw Watermark Text
        if (watermarkConfig.enabled && watermarkConfig.text) {
            let wx = (watermarkConfig.x / 100) * canvas.width;
            let wy = (watermarkConfig.y / 100) * canvas.height;
            
            if (watermarkConfig.floating) {
                const time = audio ? audio.currentTime : (performance.now() / 1000);
                // Create a bouncing movement pattern
                const periodX = 7; // seconds for a full horizontal cycle
                const periodY = 11; // seconds for a full vertical cycle
                
                // Using sine for smooth bounce
                const moveX = (Math.sin(time * (Math.PI * 2 / periodX)) + 1) / 2; // 0 to 1
                const moveY = (Math.sin(time * (Math.PI * 2 / periodY)) + 1) / 2; // 0 to 1
                
                // Margin to keep it inside screen (roughly)
                const margin = 10; 
                wx = (margin + moveX * (100 - margin * 2)) / 100 * canvas.width;
                wy = (margin + moveY * (100 - margin * 2)) / 100 * canvas.height;
            }

            ctx.save();
            ctx.globalAlpha = watermarkConfig.opacity;
            ctx.fillStyle = watermarkConfig.color;
            ctx.font = `${watermarkConfig.fontSize}px Inter`;
            
            // If floating, align center to avoid going off screen edges partially
            if (watermarkConfig.floating) {
                ctx.textAlign = 'center';
            } else {
                ctx.textAlign = watermarkConfig.x > 50 ? 'right' : (watermarkConfig.x < 30 ? 'left' : 'center');
            }
            
            ctx.textBaseline = 'middle';
            ctx.fillText(watermarkConfig.text, wx, wy);
            ctx.restore();
        }

        // Draw Subtitles
        if (subtitleConfig.enabled && audio) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.font = `bold ${subtitleConfig.fontSize}px Inter`;
            
            if (subtitleConfig.shadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
            }
            
            ctx.fillStyle = subtitleConfig.color;
            
            const currentTime = audio.currentTime;
            
            // Optimized subtitle lookup: Since time usually moves forward, start from last index
            let activeChunk = null;
            
            // Check if last chunk is still active
            const lastChunk = displayChunks[lastChunkIndexRef.current];
            if (lastChunk && lastChunk.startTime !== undefined && lastChunk.endTime !== undefined && 
                currentTime >= lastChunk.startTime && currentTime <= lastChunk.endTime) {
                activeChunk = lastChunk;
            } else {
                // If not, find the new one, starting from current index
                for (let i = 0; i < displayChunks.length; i++) {
                    const c = displayChunks[i];
                    if (c.startTime !== undefined && c.endTime !== undefined && 
                        currentTime >= c.startTime && currentTime <= c.endTime) {
                        activeChunk = c;
                        lastChunkIndexRef.current = i;
                        break;
                    }
                }
            }

            let textToDraw = '';
            if (activeChunk) {
                textToDraw = activeChunk.text;
            } else if (!bgSource && !audio.paused) {
                textToDraw = 'Vui lòng chọn ảnh/video nền...';
            }

            if (textToDraw) {
                ctx.fillText(textToDraw, canvas.width / 2, canvas.height - subtitleConfig.bottomMargin);
            }
            ctx.restore();
        }

        requestRef.current = requestAnimationFrame(render);
    };

    const startRendering = async () => {
        const canvas = canvasRef.current;
        const audio = audioRef.current;
        if (!canvas || !audio) return;

        setIsRendering(true);
        setProgress(0);

        // Lower FPS to 30 for faster and more stable encoding on more devices
        const stream = canvas.captureStream(30);
        
        if (!audioNodesRef.current) {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
            const dest = audioContext.createMediaStreamDestination();
            
            // Subtitle Audio (Foreground)
            const source = audioContext.createMediaElementSource(audio);
            const mainGain = audioContext.createGain();
            mainGain.gain.value = 1.0;
            source.connect(mainGain);
            mainGain.connect(dest);
            mainGain.connect(audioContext.destination);

            // Background Video Audio (Low Volume)
            let createdVideoGain: GainNode | undefined;
            if (videoRef.current) {
                try {
                    const videoSource = audioContext.createMediaElementSource(videoRef.current);
                    const videoGain = audioContext.createGain();
                    videoGain.gain.value = bgAudioVolume;
                    videoSource.connect(videoGain);
                    videoGain.connect(dest);
                    videoGain.connect(audioContext.destination);
                    createdVideoGain = videoGain;
                } catch (e) {
                    console.warn("Could not connect video audio: ", e);
                }
            }

            audioNodesRef.current = { ctx: audioContext, source: mainGain as any, dest, videoGain: createdVideoGain };
        }
        const dest = audioNodesRef.current.dest;
        
        const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                }
            }
        }

        const recorder = new MediaRecorder(combinedStream, { 
            mimeType,
            videoBitsPerSecond: 8000000, // 8 Mbps
            audioBitsPerSecond: 128000   // 128 kbps
        });
        const recordedChunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        recorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            a.download = `vocalis_video_${Date.now()}.${ext}`;
            a.click();
            setIsRendering(false);
        };

        if (audioNodesRef.current?.ctx.state === 'suspended') {
            await audioNodesRef.current.ctx.resume();
        }

        audio.currentTime = 0;
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.muted = false; // Ensure unmuted for capture
        }

        const playPromises: Promise<void>[] = [];
        playPromises.push(audio.play().catch(e => console.warn(e)));
        if (videoRef.current) {
            playPromises.push(videoRef.current.play().catch(e => console.warn(e)));
        }
        await Promise.all(playPromises);

        // Start recorder ONLY AFTER media is confirmed playing
        recorder.start();

        const updateProgress = () => {
            if (audio.duration) {
                const p = (audio.currentTime / audio.duration) * 100;
                setProgress(p);
                if (audio.ended) {
                    recorder.stop();
                    if (videoRef.current) videoRef.current.pause();
                    return;
                }
            }
            requestAnimationFrame(updateProgress);
        };
        updateProgress();
    };

    useEffect(() => {
        isLoopingRef.current = true;
        requestRef.current = requestAnimationFrame(render);
        return () => {
            isLoopingRef.current = false;
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [bgSource, bgType, blurConfig, subtitleConfig, logoConfig, logoSource, watermarkConfig, imageLoaded, isRendering, displayChunks]);

    return (
        <div className={onClose ? "fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4" : "w-full"}>
            <div className={`bg-[#0F0F0F] border border-[#262626] rounded-3xl w-full max-w-6xl overflow-hidden flex flex-col shadow-3xl mx-auto ${onClose ? "max-h-[95vh]" : ""}`}>
                <div className="px-8 py-6 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-900/20 rounded-xl border border-blue-900/20">
                            <Film className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Sản xuất Video Pro</h2>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-[0.2em]">Cấu hình nâng cao • Hỗ trợ Làm mờ & Subtitles</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {onClose && (
                            <button onClick={onClose} className="p-2 hover:bg-[#262626] rounded-full transition-colors text-gray-500">
                                <X size={24} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-10 grid grid-cols-1 xl:grid-cols-12 gap-12">
                    <div className="xl:col-span-4 space-y-8">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">1. Tài nguyên đầu vào</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <label className="cursor-pointer group relative overflow-hidden h-32 bg-[#141414] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                    <div className="p-3 bg-blue-950/20 rounded-full group-hover:scale-110 transition-transform">
                                        <ImageIcon size={28} className="text-gray-600 group-hover:text-blue-400" />
                                    </div>
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest">Ảnh Nền</span>
                                    {bgType === 'image' && bgSource && <div className="absolute right-4 top-4 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>}
                                </label>
                                <label className="cursor-pointer group relative overflow-hidden h-32 bg-[#141414] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                                    <div className="p-3 bg-purple-950/20 rounded-full group-hover:scale-110 transition-transform">
                                        <Video size={28} className="text-gray-600 group-hover:text-purple-400" />
                                    </div>
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest">Video Nền</span>
                                    {bgType === 'video' && bgSource && <div className="absolute right-4 top-4 w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>}
                                </label>
                                <label className="cursor-pointer group relative overflow-hidden h-32 bg-[#141414] border border-[#262626] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const url = URL.createObjectURL(file);
                                                setLogoSource(url);
                                                setLogoConfig(prev => ({ ...prev, enabled: true }));
                                            }
                                        }} 
                                    />
                                    <div className="p-3 bg-amber-950/20 rounded-full group-hover:scale-110 transition-transform">
                                        <Camera size={28} className="text-gray-600 group-hover:text-amber-400" />
                                    </div>
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest">Logo</span>
                                    {logoSource && <div className="absolute right-4 top-4 w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>}
                                </label>
                            </div>

                            {bgType === 'video' && bgSource && (
                                <div className="p-4 bg-[#141414] border border-[#262626] rounded-2xl space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Âm thanh Video gốc: {Math.round(bgAudioVolume * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="100" 
                                        value={bgAudioVolume * 100} 
                                        onChange={(e) => setBgAudioVolume(parseInt(e.target.value) / 100)}
                                        className="w-full h-1 bg-[#262626] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="md:col-span-1 cursor-pointer group relative overflow-hidden h-16 bg-[#141414] border border-[#262626] rounded-2xl flex items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input type="file" accept="audio/*" className="hidden" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file && onAudioChange) {
                                            const url = URL.createObjectURL(file);
                                            onAudioChange(url, []); // reset chunks since it's external
                                            setCustomChunks(null);
                                        }
                                    }} />
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest flex items-center gap-2">
                                        Đổi Âm Thanh
                                    </span>
                                </label>
                                <label className="md:col-span-1 cursor-pointer group relative overflow-hidden h-16 bg-[#141414] border border-[#262626] rounded-2xl flex items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all">
                                    <input type="file" accept=".srt" className="hidden" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (e) => {
                                                const text = e.target?.result as string;
                                                const parsed = parseSrtToChunks(text);
                                                setCustomChunks(parsed);
                                            };
                                            reader.readAsText(file);
                                        }
                                    }} />
                                    <span className="text-xs font-bold uppercase text-gray-500 group-hover:text-white tracking-widest flex items-center gap-2">
                                        Tải Phụ Đề SRT
                                    </span>
                                    {customChunks && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-green-500 rounded-full"></div>}
                                </label>
                            </div>
                            <button 
                                onClick={() => setShowSettings(true)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-[#1A1A1A] hover:bg-[#262626] text-white rounded-2xl text-xs font-black uppercase tracking-widest border border-[#333] transition-all hover:border-blue-500/30"
                            >
                                <Settings size={16} className="text-blue-400" />
                                Cấu hình Vùng mờ & Phụ đề
                            </button>
                        </div>

                        <div className="p-6 bg-blue-900/5 border border-blue-900/10 rounded-2xl space-y-3">
                            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Thông tin hệ thống</h4>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                Đang sử dụng bộ giải mã <span className="text-white font-bold">VP9 High Performance</span>. Video sẽ được xuất với độ phân giải <span className="text-white font-bold">1280x720</span> ở tốc độ 30 FPS.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                                onClick={() => {
                                    if (canvasRef.current) {
                                        setPreviewImage(canvasRef.current.toDataURL('image/jpeg', 0.9));
                                    }
                                }}
                                disabled={isRendering || !bgSource}
                                className="w-full py-5 bg-[#141414] border border-[#262626] hover:bg-[#1a1a1a] hover:border-blue-500/50 disabled:opacity-20 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-4"
                            >
                                <Camera size={18} />
                                Xem trước 1 khung
                            </button>
                            <button 
                                onClick={startRendering}
                                disabled={isRendering || !bgSource}
                                className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-20 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-blue-900/20 active:scale-[0.98] flex flex-col items-center justify-center gap-1"
                            >
                                <div className="flex items-center gap-4">
                                    {isRendering ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    <span>{isRendering ? `Đang xuất video (${Math.round(progress)}%)...` : 'Bàn giao Render'}</span>
                                </div>
                                {isRendering && (
                                    <span className="text-[9px] text-blue-200 uppercase tracking-widest font-normal opacity-80 mt-1">
                                        ⚠️ Không thu nhỏ tab này để tránh lệch Audio
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="xl:col-span-8 space-y-6">
                        <div className="flex justify-between items-end">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Xem trước Preview (Real-time)</label>
                            <div className="flex gap-4">
                                {blurConfig.enabled && <span className="px-2 py-0.5 bg-amber-900/20 text-amber-500 text-[10px] font-bold rounded uppercase tracking-tighter border border-amber-900/30 self-center">Blur Active</span>}
                                {subtitleConfig.enabled && <span className="px-2 py-0.5 bg-blue-900/20 text-blue-500 text-[10px] font-bold rounded uppercase tracking-tighter border border-blue-900/30 self-center">Subs Active</span>}
                            </div>
                        </div>
                        <div className="aspect-video w-full bg-black rounded-[2.5rem] border border-[#222] overflow-hidden relative shadow-inner group">
                            <canvas 
                                ref={canvasRef} 
                                width={1280} 
                                height={720} 
                                className="w-full h-full object-contain"
                            />
                            
                            {/* Draggable Blur Selection logic in modal, but visual indicator here could be nice too */}
                            
                            {isRendering && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center animate-in fade-in duration-500">
                                    <div className="relative h-24 w-24 mb-6">
                                        <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                                        <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-blue-500 font-black text-xs">
                                            {Math.round(progress)}%
                                        </div>
                                    </div>
                                    <p className="text-white font-black text-[10px] tracking-[0.3em] uppercase">Sản xuất nội dung...</p>
                                    <p className="text-gray-500 text-[10px] mt-2 underline cursor-not-allowed">Vui lòng không đóng trình duyệt</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-[#141414] border border-[#262626] rounded-2xl">
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Trạng thái Audio</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                    <span className="text-[10px] font-bold text-gray-300 uppercase">Sẵn sàng</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Bộ nhớ đệm</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase">128MB Global</span>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Độ phân giải</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase">1280x720 HD</span>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Mã hóa</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase">Hardware Accel</span>
                            </div>
                        </div>

                        <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-10">
                             <audio ref={audioRef} src={audioUrl} />
                             {bgType === 'video' && <video ref={videoRef} src={bgSource || ''} loop playsInline />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {previewImage && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPreviewImage(null)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md cursor-pointer"
                        ></motion.div>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-[#121212] border border-[#333] rounded-[2rem] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col"
                        >
                            <div className="p-6 border-b border-[#262626] flex justify-between items-center bg-[#0d0d0d]">
                                <div className="flex items-center gap-3">
                                    <Camera className="w-5 h-5 text-blue-500" />
                                    <h3 className="font-black text-white uppercase tracking-widest text-sm">Xem trước khung hình</h3>
                                </div>
                                <button onClick={() => setPreviewImage(null)} className="p-2 hover:bg-[#262626] rounded-full text-gray-400">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-4 bg-black flex justify-center items-center max-h-[80vh]">
                                <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl border border-[#333]" />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSettings(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        ></motion.div>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-[#121212] border border-[#333] rounded-[2rem] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-[#262626] flex justify-between items-center bg-[#0d0d0d]">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <Settings className="w-5 h-5 text-blue-500" />
                                        <h3 className="font-black text-white uppercase tracking-widest text-sm">Cấu hình Nâng cao</h3>
                                    </div>
                                    <div className="h-6 w-[1px] bg-[#333]"></div>
                                    <div className="flex gap-2">
                                        {['blur_subs', 'branding'].map(tab => (
                                            <button 
                                                key={tab}
                                                onClick={() => setSettingsTab(tab as any)}
                                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsTab === tab ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                {tab === 'blur_subs' ? 'Làm mờ & Phụ đề' : 'Logo & Watermark'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#262626] rounded-full text-gray-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 overflow-y-auto min-h-[500px]">
                                {settingsTab === 'blur_subs' ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                        {/* Left: Preview with draggable area */}
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Vùng làm mờ (Draggable)</h4>
                                                <p className="text-[10px] text-gray-500">Giữ và kéo khung mờ bên dưới để xác định vị trí nhạy cảm cần che.</p>
                                            </div>
                                            
                                            <div className="aspect-video bg-[#0D0D0D] rounded-2xl overflow-hidden relative border border-[#333] group cursor-crosshair select-none"
                                                onMouseDown={(e) => {
                                                    if (!blurConfig.enabled) return;
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const startX = ((e.clientX - rect.left) / rect.width) * 100;
                                                    const startY = ((e.clientY - rect.top) / rect.height) * 100;
                                                    
                                                    // Start drawing a new box
                                                    setBlurConfig(prev => ({
                                                        ...prev,
                                                        x: startX,
                                                        y: startY,
                                                        width: 0,
                                                        height: 0
                                                    }));
                                                    
                                                    const handleMouseMove = (mmE: MouseEvent) => {
                                                        const currentX = ((mmE.clientX - rect.left) / rect.width) * 100;
                                                        const currentY = ((mmE.clientY - rect.top) / rect.height) * 100;
                                                        
                                                        setBlurConfig(prev => ({
                                                            ...prev,
                                                            x: Math.min(startX, currentX),
                                                            y: Math.min(startY, currentY),
                                                            width: Math.abs(currentX - startX),
                                                            height: Math.abs(currentY - startY)
                                                        }));
                                                    };
                                                    
                                                    const handleMouseUp = () => {
                                                        window.removeEventListener('mousemove', handleMouseMove);
                                                        window.removeEventListener('mouseup', handleMouseUp);
                                                    };
                                                    
                                                    window.addEventListener('mousemove', handleMouseMove);
                                                    window.addEventListener('mouseup', handleMouseUp);
                                                }}
                                            >
                                                {/* Video/Image Preview in settings */}
                                                {bgType === 'image' && bgSource && <img src={bgSource} className="w-full h-full object-cover shadow-2xl" />}
                                                {bgType === 'video' && bgSource && <video src={bgSource} className="w-full h-full object-contain" muted playsInline autoPlay loop />}
                                                {!bgSource && <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 font-bold uppercase text-[10px] tracking-widest gap-2 bg-[#080808]">
                                                    <ImageIcon size={24} className="opacity-20" />
                                                    <span>Chưa chọn ảnh/video nền</span>
                                                </div>}

                                                {blurConfig.enabled && (
                                                    <div 
                                                        className="absolute border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.3)] group-hover:border-white transition-colors cursor-move"
                                                        style={{
                                                            left: `${blurConfig.x}%`,
                                                            top: `${blurConfig.y}%`,
                                                            width: `${blurConfig.width}%`,
                                                            height: `${blurConfig.height}%`
                                                        }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            if (!blurConfig.enabled) return;
                                                            const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                                                            if (!rect) return;
                                                            
                                                            const startMouseX = e.clientX;
                                                            const startMouseY = e.clientY;
                                                            const startX = blurConfig.x;
                                                            const startY = blurConfig.y;

                                                            const handleMouseMove = (mmE: MouseEvent) => {
                                                                const dx = ((mmE.clientX - startMouseX) / rect.width) * 100;
                                                                const dy = ((mmE.clientY - startMouseY) / rect.height) * 100;
                                                                
                                                                setBlurConfig(prev => ({
                                                                    ...prev,
                                                                    x: Math.min(Math.max(0, startX + dx), 100 - prev.width),
                                                                    y: Math.min(Math.max(0, startY + dy), 100 - prev.height)
                                                                }));
                                                            };
                                                            
                                                            const handleMouseUp = () => {
                                                                window.removeEventListener('mousemove', handleMouseMove);
                                                                window.removeEventListener('mouseup', handleMouseUp);
                                                            };
                                                            
                                                            window.addEventListener('mousemove', handleMouseMove);
                                                            window.addEventListener('mouseup', handleMouseUp);
                                                        }}
                                                    >
                                                        <div className="absolute inset-0 backdrop-blur-md pointer-events-none"></div>
                                                        <div className="absolute right-0 bottom-0 w-4 h-4 bg-white cursor-se-resize flex items-center justify-center translate-x-1/2 translate-y-1/2 rounded-full shadow-lg"
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                const rect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                                                                if (!rect) return;
                                                                const startX = blurConfig.x;
                                                                const startY = blurConfig.y;

                                                                const handleMouseMove = (mmE: MouseEvent) => {
                                                                    const currentX = ((mmE.clientX - rect.left) / rect.width) * 100;
                                                                    const currentY = ((mmE.clientY - rect.top) / rect.height) * 100;
                                                                    
                                                                    setBlurConfig(prev => ({
                                                                        ...prev,
                                                                        width: Math.min(Math.max(2, currentX - startX), 100 - startX),
                                                                        height: Math.min(Math.max(2, currentY - startY), 100 - startY)
                                                                    }));
                                                                };
                                                                
                                                                const handleMouseUp = () => {
                                                                    window.removeEventListener('mousemove', handleMouseMove);
                                                                    window.removeEventListener('mouseup', handleMouseUp);
                                                                };
                                                                
                                                                window.addEventListener('mousemove', handleMouseMove);
                                                                window.addEventListener('mouseup', handleMouseUp);
                                                            }}
                                                        >
                                                            <Maximize2 size={8} className="text-black" />
                                                        </div>
                                                        <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded">BLUR AREA</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-[#1A1A1A] rounded-2xl border border-[#262626]">
                                                    <label className="flex items-center justify-between cursor-pointer">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kích hoạt làm mờ</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={blurConfig.enabled} 
                                                            onChange={(e) => setBlurConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600"
                                                        />
                                                    </label>
                                                </div>
                                                <div className="p-4 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Độ mờ: {blurConfig.amount}px</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="100" 
                                                        value={blurConfig.amount} 
                                                        onChange={(e) => setBlurConfig(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                                                        className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-6 pt-4 border-t border-[#262626]">
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Âm lượng video gốc</h4>
                                                </div>
                                                <div className="p-6 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Âm lượng: {Math.round(bgAudioVolume * 100)}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="100" 
                                                        value={bgAudioVolume * 100} 
                                                        onChange={(e) => setBgAudioVolume(parseInt(e.target.value) / 100)}
                                                        className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Subtitle Settings */}
                                        <div className="space-y-8">
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-2">
                                                    <Type size={16} className="text-blue-400" />
                                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Cấu hình chữ & Phụ đề</h4>
                                                </div>

                                                <div className="p-6 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-6">
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Cỡ chữ (Px): {subtitleConfig.fontSize}</span>
                                                        </div>
                                                        <input 
                                                            type="range" min="12" max="120" 
                                                            value={subtitleConfig.fontSize} 
                                                            onChange={(e) => setSubtitleConfig(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                                                            className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                        />
                                                    </div>

                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Lề dưới (Offset): {subtitleConfig.bottomMargin}</span>
                                                        </div>
                                                        <input 
                                                            type="range" min="20" max="400" 
                                                            value={subtitleConfig.bottomMargin} 
                                                            onChange={(e) => setSubtitleConfig(prev => ({ ...prev, bottomMargin: parseInt(e.target.value) }))}
                                                            className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                        />
                                                    </div>

                                                    <div className="flex items-center justify-between pt-2">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Màu sắc</span>
                                                        <div className="flex gap-2">
                                                            {['#ffffff', '#facc15', '#ef4444', '#3b82f6'].map(color => (
                                                                <button 
                                                                    key={color}
                                                                    onClick={() => setSubtitleConfig(prev => ({ ...prev, color }))}
                                                                    className={`w-6 h-6 rounded-full border-2 transition-all ${subtitleConfig.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                                    style={{ backgroundColor: color }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    
                                                    <label className="flex items-center justify-between cursor-pointer pt-2">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Đổ bóng (Text Shadow)</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={subtitleConfig.shadow} 
                                                            onChange={(e) => setSubtitleConfig(prev => ({ ...prev, shadow: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600"
                                                        />
                                                    </label>
                                                </div>

                                                <button 
                                                    onClick={() => setShowSettings(false)}
                                                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                                                >
                                                    Lưu thay đổi & Quay lại
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-10">
                                        {/* Unified Branding Preview Area */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Xem trước Logo & Watermark</h4>
                                                <p className="text-[10px] text-gray-500">Giúp căn chỉnh chính xác vị trí hiển thị thương hiệu.</p>
                                            </div>
                                            <div className="aspect-video bg-[#0D0D0D] rounded-2xl overflow-hidden relative border border-[#333] shadow-2xl">
                                                {/* Background Preview */}
                                                {bgType === 'image' && bgSource && <img src={bgSource} className="w-full h-full object-cover opacity-50" />}
                                                {bgType === 'video' && bgSource && <video src={bgSource} className="w-full h-full object-contain opacity-50" muted playsInline autoPlay loop />}
                                                
                                                {/* Logo Overlay */}
                                                {logoSource && logoConfig.enabled && (
                                                    <div 
                                                        className="absolute transition-all duration-100"
                                                        style={{
                                                            left: `${logoConfig.x}%`,
                                                            top: `${logoConfig.y}%`,
                                                            width: `${logoConfig.scale}%`,
                                                            opacity: logoConfig.opacity,
                                                        }}
                                                    >
                                                        <img src={logoSource} className="w-full h-auto" />
                                                    </div>
                                                )}

                                                {/* Watermark Overlay */}
                                                {watermarkConfig.enabled && watermarkConfig.text && (
                                                    <div 
                                                        className="absolute transition-all duration-100 whitespace-nowrap pointer-events-none"
                                                        style={{
                                                            left: `${watermarkConfig.x}%`,
                                                            top: `${watermarkConfig.y}%`,
                                                            color: watermarkConfig.color,
                                                            fontSize: `${watermarkConfig.fontSize / 2}px`, // Scaled for preview
                                                            opacity: watermarkConfig.opacity,
                                                            transform: watermarkConfig.x > 50 ? 'translateX(-100%)' : (watermarkConfig.x < 30 ? 'none' : 'translateX(-50%)'),
                                                            fontFamily: 'Inter, sans-serif',
                                                            fontWeight: 'bold'
                                                        }}
                                                    >
                                                        {watermarkConfig.text}
                                                    </div>
                                                )}

                                                {!bgSource && (
                                                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-700 font-bold uppercase tracking-widest">
                                                        Chưa chọn nền để xem trước
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                            {/* Logo Column */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-2">
                                                    <Camera size={16} className="text-blue-400" />
                                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Cấu hình Logo</h4>
                                                </div>
                                                
                                                <div className="p-6 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-6">
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {!logoSource ? (
                                                            <label className="cursor-pointer py-4 border-2 border-dashed border-[#333] rounded-xl flex flex-col items-center gap-2 hover:border-blue-500/50 transition-colors">
                                                                <input 
                                                                    type="file" accept="image/*" className="hidden" 
                                                                    onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) {
                                                                            const url = URL.createObjectURL(file);
                                                                            setLogoSource(url);
                                                                            setLogoConfig(prev => ({ ...prev, enabled: true }));
                                                                        }
                                                                    }} 
                                                                />
                                                                <ImageIcon size={20} className="text-gray-600" />
                                                                <span className="text-[10px] font-bold text-gray-500 uppercase">Tải Logo</span>
                                                            </label>
                                                        ) : (
                                                            <div className="flex items-center justify-between p-3 bg-[#0D0D0D] rounded-xl border border-[#262626]">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] p-1 flex-shrink-0">
                                                                        <img src={logoSource} className="w-full h-full object-contain" />
                                                                    </div>
                                                                    <span className="text-[10px] text-gray-500 truncate">logo_selected.png</span>
                                                                </div>
                                                                <button onClick={() => setLogoSource(null)} className="p-2 hover:bg-[#262626] rounded-lg text-red-500">
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hiển thị Logo</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={logoConfig.enabled} 
                                                            onChange={(e) => setLogoConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600"
                                                        />
                                                    </div>

                                                    <div className="space-y-3">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block">Kích thước: {logoConfig.scale}%</span>
                                                        <input 
                                                            type="range" min="1" max="100" 
                                                            value={logoConfig.scale} 
                                                            onChange={(e) => setLogoConfig(prev => ({ ...prev, scale: parseInt(e.target.value) }))}
                                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest block">Vị trí X: {logoConfig.x}%</span>
                                                            <input 
                                                                type="range" min="0" max="100" 
                                                                value={logoConfig.x} 
                                                                onChange={(e) => setLogoConfig(prev => ({ ...prev, x: parseInt(e.target.value) }))}
                                                                className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest block">Vị trí Y: {logoConfig.y}%</span>
                                                            <input 
                                                                type="range" min="0" max="100" 
                                                                value={logoConfig.y} 
                                                                onChange={(e) => setLogoConfig(prev => ({ ...prev, y: parseInt(e.target.value) }))}
                                                                className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block">Độ trong suốt: {Math.round(logoConfig.opacity * 100)}%</span>
                                                        <input 
                                                            type="range" min="0" max="100" 
                                                            value={logoConfig.opacity * 100} 
                                                            onChange={(e) => setLogoConfig(prev => ({ ...prev, opacity: parseInt(e.target.value) / 100 }))}
                                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Watermark Column */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-2">
                                                    <Type size={16} className="text-purple-400" />
                                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Chữ Watermark</h4>
                                                </div>

                                                <div className="p-6 bg-[#1A1A1A] rounded-2xl border border-[#262626] space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Nội dung Watermark</label>
                                                        <input 
                                                            type="text"
                                                            value={watermarkConfig.text}
                                                            onChange={(e) => setWatermarkConfig(prev => ({ ...prev, text: e.target.value }))}
                                                            placeholder="Nhập tên thương hiệu, SĐT..."
                                                            className="w-full bg-[#0D0D0D] border border-[#262626] rounded-xl p-3 text-sm text-gray-200 outline-none focus:border-blue-500"
                                                        />
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kích hoạt Watermark</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={watermarkConfig.enabled} 
                                                            onChange={(e) => setWatermarkConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-purple-600"
                                                        />
                                                    </div>

                                                    <div className="p-4 bg-purple-950/10 rounded-xl border border-purple-900/20">
                                                        <label className="flex items-center justify-between cursor-pointer">
                                                            <div className="space-y-0.5">
                                                                <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Chế độ Chạy khắp màn hình</span>
                                                                <p className="text-[9px] text-gray-500 leading-tight">Văn bản sẽ di chuyển liên tục để chống các phần mềm xóa logo.</p>
                                                            </div>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={watermarkConfig.floating} 
                                                                onChange={(e) => setWatermarkConfig(prev => ({ ...prev, floating: e.target.checked }))}
                                                                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-purple-600"
                                                            />
                                                        </label>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block">Cỡ chữ: {watermarkConfig.fontSize}px</span>
                                                        <input 
                                                            type="range" min="10" max="100" 
                                                            value={watermarkConfig.fontSize} 
                                                            onChange={(e) => setWatermarkConfig(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                        />
                                                    </div>

                                                    {!watermarkConfig.floating && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest block">Vị trí X: {watermarkConfig.x}%</span>
                                                                <input 
                                                                    type="range" min="0" max="100" 
                                                                    value={watermarkConfig.x} 
                                                                    onChange={(e) => setWatermarkConfig(prev => ({ ...prev, x: parseInt(e.target.value) }))}
                                                                    className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest block">Vị trí Y: {watermarkConfig.y}%</span>
                                                                <input 
                                                                    type="range" min="0" max="100" 
                                                                    value={watermarkConfig.y} 
                                                                    onChange={(e) => setWatermarkConfig(prev => ({ ...prev, y: parseInt(e.target.value) }))}
                                                                    className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Màu sắc</span>
                                                        <div className="flex gap-2">
                                                            {['#ffffff', '#facc15', '#ef4444', '#3b82f6'].map(color => (
                                                                <button 
                                                                    key={color}
                                                                    onClick={() => setWatermarkConfig(prev => ({ ...prev, color }))}
                                                                    className={`w-6 h-6 rounded-full border-2 transition-all ${watermarkConfig.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                                    style={{ backgroundColor: color }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block">Độ trong suốt: {Math.round(watermarkConfig.opacity * 100)}%</span>
                                                        <input 
                                                            type="range" min="0" max="100" 
                                                            value={watermarkConfig.opacity * 100} 
                                                            onChange={(e) => setWatermarkConfig(prev => ({ ...prev, opacity: parseInt(e.target.value) / 100 }))}
                                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                        />
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => setShowSettings(false)}
                                                    className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20"
                                                >
                                                    Xác nhận & Quay lại
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
