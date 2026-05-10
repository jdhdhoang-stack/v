
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ChunkJob, ProcessingState } from '../src/types';
import { APP_KEY, SPEAKER_GROUPS } from '../src/constants';
import { TextProcessor } from '../services/textProcessor';
import { synthesizeChunk } from '../services/ttsService';
import { Configuration } from './Configuration';
import { ResultsPanel } from './ResultsPanel';
import { keyManager } from '../services/keyManager';
import { v4 as uuidv4 } from 'uuid';

import { audioBufferToWav } from '../src/lib/audioUtils';

export const TextToSpeech: React.FC<{ 
    onAudioMerged?: (url: string | null) => void,
    onChunksUpdated?: (chunks: ChunkJob[]) => void 
}> = ({ onAudioMerged, onChunksUpdated }) => {
    const [chunks, setChunks] = useState<ChunkJob[]>([]);
    
    useEffect(() => {
        onChunksUpdated?.(chunks);
    }, [chunks, onChunksUpdated]);
    const [speaker, setSpeaker] = useState<string>("BV074_streaming");
    const [selectedCountry, setSelectedCountry] = useState<string>(SPEAKER_GROUPS[0].country);
    const [processingState, setProcessingState] = useState<ProcessingState>('idle');
    const [isMerging, setIsMerging] = useState(false);
    const [mergeProgress, setMergeProgress] = useState(0);
    const [maxChars, setMaxChars] = useState(1500);
    const [minCharsToMerge, setMinCharsToMerge] = useState(30);
    const [concurrentThreads, setConcurrentThreads] = useState(10);
    const [requestDelay, setRequestDelay] = useState(100);
    const [mergedAudioUrls, setMergedAudioUrls] = useState<string[]>([]);
    const [shouldProcess, setShouldProcess] = useState(false);
    
    const abortControllerRef = useRef<AbortController | null>(null);

    const successfulChunksCount = useMemo(() => chunks.filter(c => c.status === 'finished').length, [chunks]);
    const failedChunksCount = useMemo(() => chunks.filter(c => c.status === 'error').length, [chunks]);
    const totalChunksCount = chunks.length;
    const remainingChunksCount = useMemo(() => chunks.filter(c => c.status === 'pending' || c.status === 'processing').length, [chunks]);
    const pendingChunksCount = useMemo(() => chunks.filter(c => c.status === 'pending').length, [chunks]);
    
    useEffect(() => {
        const areAllJobsDone = totalChunksCount > 0 && chunks.every(c => c.status === 'finished' || c.status === 'error');
        const hasFinishedChunks = chunks.some(c => c.status === 'finished');

        if (processingState === 'idle' && areAllJobsDone && hasFinishedChunks && failedChunksCount === 0) {
            const mergeAudio = async () => {
                let audioContext: AudioContext | null = null;
                try {
                    setIsMerging(true);
                    setMergeProgress(0);
                    const finishedChunks = chunks.filter(c => c.status === 'finished' && c.audioUrl);
                    if (finishedChunks.length === 0) {
                        setIsMerging(false);
                        return;
                    }

                    // Check if we should use timing-based merge
                    const isTimedMerge = chunks.some(c => c.startTime !== undefined);
                    const PART_SIZE = 500;
                    const finalUrls: string[] = [];

                    for (let p = 0; p < finishedChunks.length; p += PART_SIZE) {
                        const partChunks = finishedChunks.slice(p, p + PART_SIZE);
                        const progressOffset = (p / finishedChunks.length) * 100;
                        const progressMultiplier = partChunks.length / finishedChunks.length;

                        if (isTimedMerge) {
                            const OfflineAudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
                            audioContext = new OfflineAudioCtx(1, 1, 44100) as unknown as AudioContext;
                            
                            const baseTime = partChunks[0].startTime || 0;
                            // Load and decode in batches
                            const audioBuffers = [];
                            const batchSize = 10;
                            for (let i = 0; i < partChunks.length; i += batchSize) {
                                const batch = partChunks.slice(i, i + batchSize);
                                const batchResult = await Promise.all(
                                    batch.map(async chunk => {
                                        try {
                                            const response = await fetch(chunk.audioUrl!);
                                            const arrayBuffer = await response.arrayBuffer();
                                            
                                            // Wrap decode in Promise for older Safari support + safety
                                            const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
                                                try {
                                                    const promise = audioContext!.decodeAudioData(arrayBuffer, resolve, reject);
                                                    if (promise) {
                                                        promise.catch(reject);
                                                    }
                                                } catch (err) {
                                                    reject(err);
                                                }
                                            });

                                            return {
                                                buffer: audioBuffer,
                                                startTime: (chunk.startTime !== undefined ? chunk.startTime - baseTime : 0),
                                            };
                                        } catch (e) {
                                            console.error(`Lỗi giải mã chunk ${chunk.id}:`, e);
                                            return null;
                                        }
                                    })
                                );
                                audioBuffers.push(...batchResult.filter(Boolean) as any[]);
                                setMergeProgress(Math.floor(progressOffset + (i / partChunks.length) * 50 * progressMultiplier));
                                // Yield to main thread
                                await new Promise(resolve => setTimeout(resolve, 0));
                            }
                            
                            if (audioBuffers.length === 0) {
                                throw new Error("Không giải mã được bất kỳ fragment âm thanh nào.");
                            }

                            // Sort by startTime
                            const sortedBuffers = [...audioBuffers].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
                            
                            let currentTime = 0;
                            const timedBuffers = sortedBuffers.map((item, index, arr) => {
                                    const nextItem = arr[index + 1];
                                    const originalDuration = item.buffer.duration;
                                    const idealStart = item.startTime || 0;
                                    
                                    // Dynamic Sync: Start at ideal time, or as soon as possible if delayed
                                    const actualStart = Math.max(idealStart, currentTime);
                                    
                                    let speed = 1.0;
                                    // Look ahead at next segments to determine if we need to catch up
                                    if (nextItem && nextItem.startTime !== undefined) {
                                        const nextIdealStart = nextItem.startTime;
                                        const availableWindow = nextIdealStart - actualStart;
                                        
                                        if (availableWindow <= 0) {
                                            speed = 1.25; 
                                        } else if (originalDuration > availableWindow) {
                                            speed = Math.min(1.25, originalDuration / availableWindow);
                                        }

                                        const itemAfterNext = arr[index + 2];
                                        if (itemAfterNext && itemAfterNext.startTime !== undefined) {
                                            const afterNextIdealStart = itemAfterNext.startTime;
                                            const estimatedNextStart = actualStart + (originalDuration / speed);
                                            const nextSegmentDuration = nextItem.buffer.duration;
                                            const estimatedAfterNextStart = estimatedNextStart + (nextSegmentDuration / 1.25);
                                            
                                            if (estimatedAfterNextStart > afterNextIdealStart) {
                                                speed = Math.max(speed, Math.min(1.25, speed * 1.1));
                                            }
                                        }
                                    }

                                    speed = isNaN(speed) || !isFinite(speed) ? 1.0 : Math.max(1.0, Math.min(1.25, speed));
                                    
                                    const effectiveDuration = originalDuration / speed;
                                    currentTime = actualStart + effectiveDuration;

                                    return {
                                        ...item,
                                        actualStartTime: actualStart,
                                        playbackRate: speed
                                    };
                                });

                            const totalDuration = timedBuffers.length > 0 
                                ? timedBuffers.reduce((max, item) => Math.max(max, item.actualStartTime + (item.buffer.duration / (item.playbackRate || 1.0))), 0)
                                : 0;
                            
                            const safeTotalDuration = totalDuration + 0.1;

                            // Limit max duration per part to prevent crashing OfflineAudioContext (e.g., max 15 minutes)
                            if (safeTotalDuration > 900) {
                                console.warn(`Phần gộp âm thanh quá dài (${safeTotalDuration}s), có thể gây treo trình duyệt. Khuyến nghị tách nhỏ file SRT.`);
                            }

                            const offlineCtx = new OfflineAudioContext(
                                audioBuffers[0].buffer.numberOfChannels,
                                Math.ceil(safeTotalDuration * audioBuffers[0].buffer.sampleRate),
                                audioBuffers[0].buffer.sampleRate
                            );

                            timedBuffers.forEach(item => {
                                const source = offlineCtx.createBufferSource();
                                source.buffer = item.buffer;
                                source.playbackRate.value = item.playbackRate || 1.0;
                                source.connect(offlineCtx.destination);
                                source.start(item.actualStartTime);
                            });

                            const renderedBuffer = await offlineCtx.startRendering();
                            setMergeProgress(Math.floor(progressOffset + 90 * progressMultiplier));
                            
                            await new Promise(resolve => setTimeout(resolve, 50));

                            const wavBlob = audioBufferToWav(renderedBuffer);
                            const url = URL.createObjectURL(wavBlob);
                            finalUrls.push(url);
                        } else {
                            // Regular concatenation for non-SRT text
                            const blobs: Blob[] = [];
                            const batchSize = 50;
                            for (let i = 0; i < partChunks.length; i += batchSize) {
                                const batch = partChunks.slice(i, i + batchSize);
                                const batchBlobs = await Promise.all(
                                    batch.map(async chunk => {
                                        try {
                                            const res = await fetch(chunk.audioUrl!);
                                            return await res.blob();
                                        } catch (e) {
                                            console.warn("Fetch blob failed", e);
                                            return new Blob([]);
                                        }
                                    })
                                );
                                blobs.push(...batchBlobs);
                                setMergeProgress(Math.floor(progressOffset + ((i + batchSize) / partChunks.length) * 90 * progressMultiplier));
                                // Yield to main thread
                                await new Promise(resolve => setTimeout(resolve, 0));
                            }
                            const mergedBlob = new Blob(blobs, { type: 'audio/mpeg' });
                            const url = URL.createObjectURL(mergedBlob);
                            finalUrls.push(url);
                        }
                    }

                    setMergeProgress(100);
                    setMergedAudioUrls(prev => {
                        prev.forEach(u => URL.revokeObjectURL(u));
                        return finalUrls;
                    });
                    onAudioMerged?.(finalUrls.length > 0 ? finalUrls[0] : null);
                } catch (error) {
                    console.error("Gộp file âm thanh thất bại:", error);
                } finally {
                    setIsMerging(false);
                    if (audioContext) {
                        await audioContext.close();
                    }
                }
            };
            mergeAudio();
        } else if (processingState === 'processing' || totalChunksCount === 0) {
            if (mergedAudioUrls.length > 0) {
                mergedAudioUrls.forEach(u => URL.revokeObjectURL(u));
                setMergedAudioUrls([]);
                onAudioMerged?.(null);
            }
        }
    }, [processingState, totalChunksCount, failedChunksCount, chunks]);

    const addContent = useCallback((content: string | Array<{ text: string; startTime: number; endTime: number; timestamp: string }>) => {
        let newChunkJobs: ChunkJob[];

        if (typeof content === 'string') {
            const textProcessor = new TextProcessor(maxChars, minCharsToMerge);
            const textChunks = textProcessor.process(content);
            newChunkJobs = textChunks.map(text => ({
                id: uuidv4(),
                text,
                status: 'pending',
            }));
        } else {
            newChunkJobs = content.map(chunk => ({
                id: uuidv4(),
                text: chunk.text,
                timestamp: chunk.timestamp,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                status: 'pending',
            }));
        }
        
        setChunks(prevChunks => [...prevChunks, ...newChunkJobs]);
    }, [maxChars, minCharsToMerge]);

    const removeChunk = useCallback((chunkId: string) => {
        setChunks(prevChunks => prevChunks.filter(chunk => chunk.id !== chunkId));
    }, []);

    const clearQueue = useCallback(() => {
        setChunks([]);
    }, []);

    const updateChunk = useCallback((chunkId: string, updates: Partial<ChunkJob>) => {
        setChunks(prevChunks => 
            prevChunks.map(chunk => 
                chunk.id === chunkId ? { ...chunk, ...updates } : chunk
            )
        );
    }, []);
    
    const retryChunk = useCallback((chunkId: string) => {
        setChunks(prev => 
            prev.map(c => c.id === chunkId ? { ...c, status: 'pending', error: null } : c)
        );
        setShouldProcess(true);
    }, []);

    const retryAllFailed = useCallback(() => {
        setChunks(prev => 
            prev.map(c => c.status === 'error' ? { ...c, status: 'pending', error: null } : c)
        );
        setShouldProcess(true);
    }, []);

    const processQueue = useCallback(async () => {
        const token = keyManager.getKey('tts');
        
        if (!token) {
            alert("Vui lòng nhập API Key trong phần Cài đặt (Dòng 1) trước khi bắt đầu.");
            return;
        }

        setProcessingState('processing');
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        
        const chunksToProcess = chunks.filter(c => c.status === 'pending');
        if (chunksToProcess.length === 0) {
            setProcessingState('idle');
            return;
        }

        const processSingleChunk = async (chunk: ChunkJob) => {
            if (signal.aborted) return;
            
            updateChunk(chunk.id, { status: 'processing', error: null });
            
            try {
                const audioUrl = await synthesizeChunk({
                    text: chunk.text,
                    speaker,
                    token,
                    appkey: APP_KEY,
                }, signal);
                if (!signal.aborted) {
                    updateChunk(chunk.id, { status: 'finished', audioUrl });
                }
            } catch (err: any) {
                if (signal.aborted || err.name === 'AbortError' || err.message === 'Aborted') return;
                
                if (err.message?.includes('token') || err.message?.includes('401') || err.message?.includes('429')) {
                    keyManager.markKeyAsBad(token);
                }

                 if (!signal.aborted) {
                    updateChunk(chunk.id, { status: 'error', error: (err as Error).message });
                }
            }
        };
        
        const queue = [...chunksToProcess];
        
        const workerPromises = Array(concurrentThreads).fill(null).map(async () => {
            while (queue.length > 0) {
                if (signal.aborted) break;
                const chunk = queue.shift();
                if (chunk) {
                    await processSingleChunk(chunk);
                    if (requestDelay > 0 && !signal.aborted) {
                        await new Promise(resolve => setTimeout(resolve, requestDelay));
                    }
                }
            }
        });

        await Promise.all(workerPromises);
        
        if (!signal.aborted) {
            setProcessingState('idle');
        }

    }, [chunks, speaker, concurrentThreads, requestDelay, updateChunk]);

    useEffect(() => {
        if (shouldProcess) {
            const timer = setTimeout(() => {
                processQueue();
                setShouldProcess(false);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [shouldProcess, processQueue]);


    const handleCancel = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setChunks(prev => prev.map(c => c.status === 'processing' ? { ...c, status: 'pending' } : c));
            setProcessingState('idle');
        }
    }, []);

    const handleDownloadAll = useCallback(async () => {
        if (mergedAudioUrls.length === 0) return;
        const isTimedMerge = chunks.some(c => c.startTime !== undefined);
        const baseName = isTimedMerge ? 'audio_timed_sync' : 'audio_merged';
        const ext = isTimedMerge ? '.wav' : '.mp3';
        
        for (let i = 0; i < mergedAudioUrls.length; i++) {
            const fileName = mergedAudioUrls.length > 1 ? `${baseName}_part${i + 1}${ext}` : `${baseName}${ext}`;
            const a = document.createElement('a');
            a.href = mergedAudioUrls[i];
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            // Add a small delay to avoid browser blocking multiple downloads
            if (mergedAudioUrls.length > 1 && i < mergedAudioUrls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }, [mergedAudioUrls, chunks]);
    
    const handleCountryChange = useCallback((newCountry: string) => {
        setSelectedCountry(newCountry);
        const newSpeakerGroup = SPEAKER_GROUPS.find(g => g.country === newCountry);
        if (newSpeakerGroup && newSpeakerGroup.speakers.length > 0) {
            setSpeaker(newSpeakerGroup.speakers[0].id);
        }
    }, []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <Configuration
                speaker={speaker}
                setSpeaker={setSpeaker}
                selectedCountry={selectedCountry}
                onCountryChange={handleCountryChange}
                speakerGroups={SPEAKER_GROUPS}
                isProcessing={processingState === 'processing'}
                onProcessQueue={processQueue}
                onAddContent={addContent}
                pendingChunksCount={pendingChunksCount}
                maxChars={maxChars}
                setMaxChars={setMaxChars}
                minCharsToMerge={minCharsToMerge}
                setMinCharsToMerge={setMinCharsToMerge}
                concurrentThreads={concurrentThreads}
                setConcurrentThreads={setConcurrentThreads}
                requestDelay={requestDelay}
                setRequestDelay={setRequestDelay}
            />
            <ResultsPanel
                chunks={chunks}
                processingState={processingState}
                mergedAudioUrls={mergedAudioUrls}
                isMerging={isMerging}
                mergeProgress={mergeProgress}
                onCancel={handleCancel}
                removeChunk={removeChunk}
                onClearQueue={clearQueue}
                onDownloadAll={handleDownloadAll}
                onRetryChunk={retryChunk}
                onRetryAllFailed={retryAllFailed}
                successfulChunksCount={successfulChunksCount}
                failedChunksCount={failedChunksCount}
                remainingChunksCount={remainingChunksCount}
                totalChunksCount={totalChunksCount}
            />
        </div>
    );
};
