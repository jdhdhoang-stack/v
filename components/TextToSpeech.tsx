
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
    const [mergedAudioUrls, setMergedAudioUrls] = useState<Array<{ url: string, startTime: number, isTimed: boolean }>>([]);
    const [shouldProcess, setShouldProcess] = useState(false);
    
    const abortControllerRef = useRef<AbortController | null>(null);

    const mergeFinalPartsInternal = useCallback(async (partsToMerge: Array<{ url: string, startTime: number, isTimed: boolean }>) => {
        if (partsToMerge.length === 0) return null;
        
        try {
            setIsMerging(true);
            setMergeProgress(0);
            
            const isTimed = partsToMerge.some(p => p.isTimed);
            
            if (isTimed) {
                const OfflineAudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
                const tempCtx = new OfflineAudioCtx(1, 1, 44100) as unknown as AudioContext;
                
                const buffersWithMetadata = await Promise.all(
                    partsToMerge.map(async item => {
                        try {
                            const res = await fetch(item.url);
                            const arrayBuffer = await res.arrayBuffer();
                            const buffer = await tempCtx.decodeAudioData(arrayBuffer);
                            return { buffer, startTime: item.startTime };
                        } catch (e) {
                            console.error("Lỗi giải mã audio part:", e);
                            return null;
                        }
                    })
                );

                const validBuffers = buffersWithMetadata.filter(Boolean) as any[];
                if (validBuffers.length === 0) return null;

                // IMPORTANT: In timed mode, the final file MUST start at 0s and strictly follow SRT timecodes
                const maxEnd = validBuffers.reduce((max, item) => 
                    Math.max(max, item.startTime + item.buffer.duration), 0);
                
                const offlineCtx = new OfflineAudioContext(
                    validBuffers[0].buffer.numberOfChannels,
                    Math.ceil((maxEnd + 0.1) * validBuffers[0].buffer.sampleRate),
                    validBuffers[0].buffer.sampleRate
                );

                validBuffers.forEach(item => {
                    const source = offlineCtx.createBufferSource();
                    source.buffer = item.buffer;
                    source.connect(offlineCtx.destination);
                    // Place at absolute startTime (relative to 0s)
                    source.start(item.startTime);
                });

                const renderedBuffer = await offlineCtx.startRendering();
                const wavBlob = audioBufferToWav(renderedBuffer);
                const url = URL.createObjectURL(wavBlob);
                
                setMergedAudioUrls(prev => {
                    prev.forEach(u => URL.revokeObjectURL(u.url));
                    return [{ url, startTime: 0, isTimed: true }];
                });
                onAudioMerged?.(url);
                return url;
            } else {
                const blobs = await Promise.all(
                    partsToMerge.map(async item => {
                        const res = await fetch(item.url);
                        return await res.blob();
                    })
                );
                const mergedBlob = new Blob(blobs, { type: 'audio/mpeg' });
                const url = URL.createObjectURL(mergedBlob);
                
                setMergedAudioUrls(prev => {
                    prev.forEach(u => URL.revokeObjectURL(u.url));
                    return [{ url, startTime: 0, isTimed: false }];
                });
                onAudioMerged?.(url);
                return url;
            }
        } catch (error) {
            console.error("Gộp file Master thất bại:", error);
            return null;
        } finally {
            setIsMerging(false);
            setMergeProgress(100);
        }
    }, [onAudioMerged]);

    const mergeAudio = useCallback(async () => {
        let audioContext: AudioContext | null = null;
        try {
            setIsMerging(true);
            setMergeProgress(0);
            const finishedChunks = chunks.filter(c => c.status === 'finished' && c.audioUrl);
            if (finishedChunks.length === 0) {
                setIsMerging(false);
                return;
            }

            const isTimedMerge = chunks.some(c => c.startTime !== undefined);
            const PART_SIZE = 500; // Smaller size for more visible progress
            const finalParts: Array<{ url: string, startTime: number, isTimed: boolean }> = [];

            for (let p = 0; p < finishedChunks.length; p += PART_SIZE) {
                const partChunks = finishedChunks.slice(p, p + PART_SIZE);
                const progressOffset = (p / finishedChunks.length) * 100;
                const progressMultiplier = partChunks.length / finishedChunks.length;
                const partStartTime = partChunks[0].startTime || 0;

                if (isTimedMerge) {
                    const OfflineAudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
                    audioContext = new OfflineAudioCtx(1, 1, 44100) as unknown as AudioContext;
                    
                    const baseTime = partStartTime;
                    const audioBuffers: Array<{ buffer: AudioBuffer, startTime: number }> = [];
                    const batchSize = 10;
                    for (let i = 0; i < partChunks.length; i += batchSize) {
                        const batch = partChunks.slice(i, i + batchSize);
                        const batchResult = await Promise.all(
                            batch.map(async chunk => {
                                try {
                                    const response = await fetch(chunk.audioUrl!);
                                    const arrayBuffer = await response.arrayBuffer();
                                    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
                                        try {
                                            const promise = audioContext!.decodeAudioData(arrayBuffer, resolve, reject);
                                            if (promise) promise.catch(reject);
                                        } catch (err) { reject(err); }
                                    });
                                    return {
                                        buffer: audioBuffer,
                                        startTime: (chunk.startTime !== undefined ? chunk.startTime - baseTime : 0),
                                    };
                                } catch (e) { return null; }
                            })
                        );
                        audioBuffers.push(...batchResult.filter(Boolean) as any[]);
                        setMergeProgress(Math.floor(progressOffset + (i / partChunks.length) * 50 * progressMultiplier));
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    
                    if (audioBuffers.length === 0) continue;

                    const totalDuration = audioBuffers.reduce((max, item) => Math.max(max, item.startTime + item.buffer.duration), 0);
                    const offlineCtx = new OfflineAudioContext(
                        audioBuffers[0].buffer.numberOfChannels,
                        Math.ceil((totalDuration + 0.1) * audioBuffers[0].buffer.sampleRate),
                        audioBuffers[0].buffer.sampleRate
                    );

                    audioBuffers.forEach(item => {
                        const source = offlineCtx.createBufferSource();
                        source.buffer = item.buffer;
                        source.connect(offlineCtx.destination);
                        source.start(item.startTime);
                    });

                    const renderedBuffer = await offlineCtx.startRendering();
                    const wavBlob = audioBufferToWav(renderedBuffer);
                    const url = URL.createObjectURL(wavBlob);
                    finalParts.push({ url, startTime: partStartTime, isTimed: true });
                } else {
                    const blobs: Blob[] = [];
                    const batchSize = 50;
                    for (let i = 0; i < partChunks.length; i += batchSize) {
                        const batch = partChunks.slice(i, i + batchSize);
                        const batchBlobs = await Promise.all(
                            batch.map(async chunk => {
                                try {
                                    const res = await fetch(chunk.audioUrl!);
                                    return await res.blob();
                                } catch (e) { return new Blob([]); }
                            })
                        );
                        blobs.push(...batchBlobs);
                        setMergeProgress(Math.floor(progressOffset + ((i + batchSize) / partChunks.length) * 90 * progressMultiplier));
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    const mergedBlob = new Blob(blobs, { type: 'audio/mpeg' });
                    const url = URL.createObjectURL(mergedBlob);
                    finalParts.push({ url, startTime: 0, isTimed: false });
                }
            }

            setMergeProgress(100);
            setMergedAudioUrls(prev => {
                prev.forEach(u => URL.revokeObjectURL(u.url));
                return finalParts;
            });

            // Master Merge: Padding from 0s and strictly respecting SRT timecodes
            if (isTimedMerge || finalParts.length > 1) {
                await mergeFinalPartsInternal(finalParts);
            } else {
                onAudioMerged?.(finalParts.length > 0 ? finalParts[0].url : null);
            }
            
            setMergeProgress(100);
        } catch (error) {
            console.error("Gộp file âm thanh thất bại:", error);
        } finally {
            setIsMerging(false);
            if (audioContext && typeof audioContext.close === 'function') await audioContext.close();
        }
    }, [chunks, onAudioMerged, mergeFinalPartsInternal]);

    const mergeFinalParts = useCallback(() => {
        mergeFinalPartsInternal(mergedAudioUrls);
    }, [mergeFinalPartsInternal, mergedAudioUrls]);

    const successfulChunksCount = useMemo(() => chunks.filter(c => c.status === 'finished').length, [chunks]);
    const failedChunksCount = useMemo(() => chunks.filter(c => c.status === 'error').length, [chunks]);
    const totalChunksCount = chunks.length;
    const remainingChunksCount = useMemo(() => chunks.filter(c => c.status === 'pending' || c.status === 'processing').length, [chunks]);
    const pendingChunksCount = useMemo(() => chunks.filter(c => c.status === 'pending').length, [chunks]);
    
    useEffect(() => {
        const areAllJobsDone = totalChunksCount > 0 && chunks.every(c => c.status === 'finished' || c.status === 'error');
        const hasFinishedChunks = chunks.some(c => c.status === 'finished');

        if (processingState === 'idle' && areAllJobsDone && hasFinishedChunks && failedChunksCount === 0) {
            mergeAudio();
        } else if (processingState === 'processing' || totalChunksCount === 0) {
            if (mergedAudioUrls.length > 0) {
                mergedAudioUrls.forEach(u => URL.revokeObjectURL(u.url));
                setMergedAudioUrls([]);
                onAudioMerged?.(null);
            }
        }
    }, [processingState, totalChunksCount, failedChunksCount, chunks, mergeAudio]);

    const addContent = useCallback((content: string | Array<{ text: string; startTime: number; endTime: number; timestamp: string }>) => {
        let newChunkJobs: ChunkJob[];

        if (typeof content === 'string') {
            const isSrt = content.includes('-->') && content.split('\n').some(line => /\d{2}:\d{2}:\d{2}/.test(line));
            
            if (isSrt) {
                const srtItems = TextProcessor.parseSrt(content);
                newChunkJobs = srtItems.map(item => ({
                    id: uuidv4(),
                    text: item.text,
                    timestamp: item.timestamp,
                    startTime: item.startTime,
                    endTime: item.endTime,
                    status: 'pending',
                }));
            } else {
                const textProcessor = new TextProcessor(maxChars, minCharsToMerge);
                const textChunks = textProcessor.process(content);
                newChunkJobs = textChunks.map(text => ({
                    id: uuidv4(),
                    text,
                    status: 'pending',
                }));
            }
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

    const updateChunkText = useCallback((chunkId: string, newText: string) => {
        setChunks(prev => 
            prev.map(c => c.id === chunkId ? { ...c, text: newText, status: 'pending', error: null, audioUrl: undefined } : c)
        );
        // Only trigger auto-process if we were already in processing state or if user specifically wants it?
        // Let's assume if they edit, they want it to re-queue.
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
            abortControllerRef.current.abort("Người dùng đã hủy");
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
            a.href = mergedAudioUrls[i].url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
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
                onMergeAudio={mergeAudio}
                onMergeFinalParts={mergeFinalParts}
                onRetryChunk={retryChunk}
                onUpdateChunkText={updateChunkText}
                onRetryAllFailed={retryAllFailed}
                successfulChunksCount={successfulChunksCount}
                failedChunksCount={failedChunksCount}
                remainingChunksCount={remainingChunksCount}
                totalChunksCount={totalChunksCount}
            />
        </div>
    );
};
