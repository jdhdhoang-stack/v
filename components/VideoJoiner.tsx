import React, { useState, useRef, useEffect } from 'react';
import { Film, Upload, Play, Trash2, GripVertical, Download, Loader2, Maximize2, Settings, AlertCircle, Zap, ZapOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface VideoFile {
    id: string;
    file: File;
    url: string;
}

export const VideoJoiner: React.FC = () => {
    const [videos, setVideos] = useState<VideoFile[]>([]);
    const [isRendering, setIsRendering] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
    const [resolution, setResolution] = useState({ width: 1280, height: 720 });
    const [mergeMode, setMergeMode] = useState<'fast' | 'compatible'>('fast');
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const ffmpegRef = useRef(new FFmpeg());
    const [isFfmpegLoaded, setIsFfmpegLoaded] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;

        const newVideos: VideoFile[] = files.map(file => ({
            id: Math.random().toString(36).substring(2, 9),
            file,
            url: URL.createObjectURL(file)
        }));

        setVideos(prev => [...prev, ...newVideos]);
        
        if (e.target) {
            e.target.value = '';
        }
    };

    const removeVideo = (id: string) => {
        setVideos(prev => {
            const vid = prev.find(v => v.id === id);
            if (vid) URL.revokeObjectURL(vid.url);
            return prev.filter(v => v.id !== id);
        });
    };

    const moveVideo = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= videos.length) return;
        
        setVideos(prev => {
            const next = [...prev];
            const temp = next[index];
            next[index] = next[newIndex];
            next[newIndex] = temp;
            return next;
        });
    };

    const renderWithFfmpeg = async () => {
        setIsRendering(true);
        setErrorMsg(null);
        setProgress({ current: 0, total: 0, percent: 0 });
        const ffmpeg = ffmpegRef.current;

        try {
            if (!isFfmpegLoaded) {
                setProgress({ current: 0, total: 0, percent: 5 }); // Tải Core
                const coreURL = await toBlobURL(`https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js`, 'text/javascript');
                const wasmURL = await toBlobURL(`https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm`, 'application/wasm');
                await ffmpeg.load({ coreURL, wasmURL });
                setIsFfmpegLoaded(true);
            }

            ffmpeg.on('progress', ({ progress: p }) => {
                setProgress(prev => ({ ...prev, percent: Math.max(10, Math.round(p * 100)) }));
            });

            setProgress({ current: 0, total: 0, percent: 10 });

            // Ghi file vào bộ nhớ FFmpeg
            let concatText = '';
            for (let i = 0; i < videos.length; i++) {
                const vid = videos[i];
                let ext = vid.file.name.split('.').pop()?.toLowerCase() || 'mp4';
                if (!['mp4', 'webm', 'mov'].includes(ext)) ext = 'mp4';
                const fileName = `input_${i}.${ext}`;
                await ffmpeg.writeFile(fileName, await fetchFile(vid.file));
                concatText += `file '${fileName}'\n`;
            }

            await ffmpeg.writeFile('list.txt', concatText);

            setProgress({ current: 0, total: 0, percent: 15 });

            // Chạy lệnh concat copy (không re-encode)
            const ret = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp4']);
            
            if (ret !== 0) {
                throw new Error("Ghép siêu tốc thất bại. Các video có thể không cùng định dạng (codec/kích thước). Vui lòng chuyển sang chế độ Ghép tương thích.");
            }

            const data = await ffmpeg.readFile('output.mp4');
            const outputBlob = new Blob([data], { type: 'video/mp4' });
            const url = URL.createObjectURL(outputBlob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `vocalis_fast_merged_${Date.now()}.mp4`;
            a.click();
            URL.revokeObjectURL(url);
            
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err?.message || "Có lỗi xảy ra khi gộp siêu tốc.");
        } finally {
            setIsRendering(false);
            setProgress({ current: 0, total: 0, percent: 100 });
        }
    };

    const renderWithCanvas = async () => {
        if (videos.length === 0) return;
        setErrorMsg(null);
        setIsRendering(true);
        setProgress({ current: 0, total: videos.length, percent: 0 });

        const canvas = canvasRef.current;
        const videoElement = videoRef.current;
        if (!canvas || !videoElement) {
            setIsRendering(false);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setIsRendering(false);
            return;
        }

        canvas.width = resolution.width;
        canvas.height = resolution.height;

        let audioContext: AudioContext | null = null;
        let destNode: MediaStreamAudioDestinationNode | null = null;
        let sourceNode: MediaElementAudioSourceNode | null = null;
        
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            destNode = audioContext.createMediaStreamDestination();
            sourceNode = audioContext.createMediaElementSource(videoElement);
            sourceNode.connect(destNode);
            sourceNode.connect(audioContext.destination);
        } catch (e) {
            console.warn("AudioContext creation failed, proceeding without audio routing", e);
        }

        const stream = canvas.captureStream(30);
        if (destNode) {
            destNode.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        }

        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
        
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8000000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const renderPromise = new Promise<void>((resolve, reject) => {
            recorder.onstop = () => {
                try {
                    const blob = new Blob(chunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `vocalis_merged_${Date.now()}.webm`;
                    a.click();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            recorder.onerror = (e) => reject(e);
        });

        recorder.start();

        let isDrawing = true;
        const drawFrame = () => {
            if (!isDrawing) return;
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (videoElement.videoWidth && videoElement.videoHeight) {
                const canvasRatio = canvas.width / canvas.height;
                const vidRatio = videoElement.videoWidth / videoElement.videoHeight;
                let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
                
                if (vidRatio > canvasRatio) {
                    drawWidth = canvas.width;
                    drawHeight = canvas.width / vidRatio;
                    offsetY = (canvas.height - drawHeight) / 2;
                } else {
                    drawHeight = canvas.height;
                    drawWidth = canvas.height * vidRatio;
                    offsetX = (canvas.width - drawWidth) / 2;
                }
                ctx.drawImage(videoElement, offsetX, offsetY, drawWidth, drawHeight);
            }
            
            requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);

        try {
            for (let i = 0; i < videos.length; i++) {
                setProgress(prev => ({ ...prev, current: i + 1, total: videos.length }));
                
                const vid = videos[i];
                videoElement.src = vid.url;
                
                await new Promise((res) => {
                    videoElement.onloadedmetadata = res;
                });

                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                await videoElement.play();

                await new Promise((res, rej) => {
                    videoElement.onended = res;
                    videoElement.onerror = rej;
                    
                    const updateProgress = () => {
                        if (isDrawing && videoElement.duration) {
                            const basePercent = (i / videos.length) * 100;
                            const thisVideoP = (videoElement.currentTime / videoElement.duration) * (100 / videos.length);
                            setProgress(prev => ({ ...prev, percent: Math.round(basePercent + thisVideoP) }));
                            requestAnimationFrame(updateProgress);
                        }
                    };
                    requestAnimationFrame(updateProgress);
                });
            }
        } catch (e) {
            console.error("Rendering error:", e);
            setErrorMsg("Có lỗi xảy ra trong quá trình phát video bằng Canvas.");
        } finally {
            isDrawing = false;
            recorder.stop();
            await renderPromise.catch(console.error);
            setIsRendering(false);
            setProgress({ current: 0, total: 0, percent: 100 });
        }
    };

    const handleStartMerge = () => {
        if (mergeMode === 'fast') {
            renderWithFfmpeg();
        } else {
            renderWithCanvas();
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Gộp Video</h2>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-[0.2em]">Nối nhiều video siêu tốc</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <label className="border-2 border-dashed border-[#262626] hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all rounded-3xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer">
                        <input type="file" multiple accept="video/*" className="hidden" onChange={handleFileChange} disabled={isRendering} />
                        <div className="p-4 bg-blue-900/20 rounded-full text-blue-400">
                            <Upload size={32} />
                        </div>
                        <div className="text-center">
                            <p className="text-white font-bold uppercase tracking-wider text-sm mb-1">Tải video lên</p>
                            <p className="text-gray-500 text-xs">Hỗ trợ MP4, WebM, MOV. Kéo thả hoặc click để chọn nhiều file.</p>
                        </div>
                    </label>

                    {errorMsg && (
                        <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                            <AlertCircle size={18} />
                            <span className="flex-1">{errorMsg}</span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        {videos.length > 0 && <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Danh sách phát ({videos.length} video)</h3>}
                        <AnimatePresence>
                            {videos.map((vid, index) => (
                                <motion.div 
                                    key={vid.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex items-center gap-4 p-4 bg-[#141414] border border-[#262626] rounded-2xl group"
                                >
                                    <div className="flex flex-col gap-1 items-center justify-center">
                                        <button onClick={() => moveVideo(index, 'up')} disabled={index === 0 || isRendering} className="text-gray-600 hover:text-white disabled:opacity-30 p-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7"></path></svg>
                                        </button>
                                        <button onClick={() => moveVideo(index, 'down')} disabled={index === videos.length - 1 || isRendering} className="text-gray-600 hover:text-white disabled:opacity-30 p-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                                        </button>
                                    </div>
                                    
                                    <div className="w-16 h-12 bg-black rounded-lg border border-[#333] overflow-hidden relative flex-shrink-0">
                                        <video src={vid.url} className="w-full h-full object-cover" preload="metadata" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                            <Film size={14} className="text-gray-300" />
                                        </div>
                                    </div>

                                    <div className="flex-grow overflow-hidden">
                                        <p className="text-sm font-medium text-white truncate">{vid.file.name}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{(vid.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                                    </div>

                                    <button 
                                        onClick={() => removeVideo(vid.id)}
                                        disabled={isRendering}
                                        className="p-3 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all disabled:opacity-50"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {videos.length === 0 && (
                            <div className="p-10 text-center border border-dashed border-[#262626] rounded-2xl">
                                <p className="text-gray-600 text-sm">Chưa có video nào. Vui lòng tải lên ít nhất 2 video để bắt đầu gộp.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="p-6 bg-[#141414] border border-[#262626] rounded-3xl space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block">Chế độ gộp</label>
                            <div className="grid grid-cols-1 gap-3">
                                <label className={`flex flex-col gap-2 p-4 border rounded-xl cursor-pointer transition-all ${mergeMode === 'fast' ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-[#333] hover:border-gray-600 bg-transparent'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap size={16} className={mergeMode === 'fast' ? 'text-yellow-500' : 'text-gray-500'} />
                                            <span className={`text-sm font-bold ${mergeMode === 'fast' ? 'text-yellow-500' : 'text-gray-300'}`}>Ghép siêu tốc (FFmpeg)</span>
                                        </div>
                                        <input type="radio" name="mode" checked={mergeMode === 'fast'} onChange={() => setMergeMode('fast')} className="hidden" disabled={isRendering} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 leading-relaxed ml-6">
                                        Cực nhanh (vài giây), giữ nguyên chất lượng gốc. <strong>Yêu cầu:</strong> các video phải cùng chiều kích thước, cùng codec và định dạng.
                                    </p>
                                </label>
                                
                                <label className={`flex flex-col gap-2 p-4 border rounded-xl cursor-pointer transition-all ${mergeMode === 'compatible' ? 'border-blue-500/50 bg-blue-500/10' : 'border-[#333] hover:border-gray-600 bg-transparent'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Settings size={16} className={mergeMode === 'compatible' ? 'text-blue-500' : 'text-gray-500'} />
                                            <span className={`text-sm font-bold ${mergeMode === 'compatible' ? 'text-blue-500' : 'text-gray-300'}`}>Ghép tương thích (Canvas)</span>
                                        </div>
                                        <input type="radio" name="mode" checked={mergeMode === 'compatible'} onChange={() => setMergeMode('compatible')} className="hidden" disabled={isRendering} />
                                    </div>
                                    <p className="text-[10px] text-gray-500 leading-relaxed ml-6">
                                        Tốc độ 1x (Real-time). Hỗ trợ ghép mọi loại video có kích thước, định dạng khác nhau. Gộp xong sẽ thành WebM tự động điều chỉnh.
                                    </p>
                                </label>
                            </div>
                        </div>

                        <AnimatePresence>
                            {mergeMode === 'compatible' && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block mt-4">Kích thước Canvas</label>
                                    <div className="space-y-3">
                                        <label className="flex items-center justify-between p-3 border border-[#333] rounded-xl cursor-pointer hover:border-blue-500/50">
                                            <span className="text-sm text-gray-300 font-medium">1080p (FHD)</span>
                                            <input type="radio" name="res" checked={resolution.width === 1920} onChange={() => setResolution({width: 1920, height: 1080})} className="accent-blue-500 w-4 h-4" disabled={isRendering} />
                                        </label>
                                        <label className="flex items-center justify-between p-3 border border-[#333] rounded-xl cursor-pointer hover:border-blue-500/50">
                                            <span className="text-sm text-gray-300 font-medium">720p (HD)</span>
                                            <input type="radio" name="res" checked={resolution.width === 1280} onChange={() => setResolution({width: 1280, height: 720})} className="accent-blue-500 w-4 h-4" disabled={isRendering} />
                                        </label>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button 
                            onClick={handleStartMerge}
                            disabled={isRendering || videos.length < 2}
                            className={`w-full py-5 disabled:opacity-20 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all flex flex-col items-center justify-center gap-1 relative overflow-hidden ${mergeMode === 'fast' ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 shadow-xl shadow-yellow-900/20' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-xl shadow-blue-900/20'}`}
                        >
                            <div className="flex items-center gap-4 relative z-10">
                                {isRendering ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                                <span>{isRendering ? `Đang xử lý (${progress.percent}%)...` : 'Bắt đầu gộp Video'}</span>
                            </div>
                            {isRendering && progress.total > 0 && mergeMode === 'compatible' && (
                                <span className="text-[9px] text-white/70 uppercase tracking-widest font-normal opacity-80 mt-1 relative z-10">
                                    Video {progress.current} / {progress.total}
                                </span>
                            )}
                            {isRendering && (
                                <div className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300" style={{ width: `${progress.percent}%` }}></div>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
            <video ref={videoRef} playsInline className="hidden" crossOrigin="anonymous" />
        </div>
    );
};

