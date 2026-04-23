
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ChunkJob, ProcessingState } from '../src/types';
import { APP_KEY, SPEAKER_GROUPS } from '../src/constants';
import { TextProcessor } from '../services/textProcessor';
import { synthesizeChunk } from '../services/ttsService';
import { Configuration } from './Configuration';
import { ResultsPanel } from './ResultsPanel';
import { keyManager } from '../services/keyManager';
import { v4 as uuidv4 } from 'uuid';

export const TextToSpeech: React.FC = () => {
    const [chunks, setChunks] = useState<ChunkJob[]>([]);
    const [speaker, setSpeaker] = useState<string>("BV074_streaming");
    const [selectedCountry, setSelectedCountry] = useState<string>(SPEAKER_GROUPS[0].country);
    const [processingState, setProcessingState] = useState<ProcessingState>('idle');
    const [maxChars, setMaxChars] = useState(1500);
    const [minCharsToMerge, setMinCharsToMerge] = useState(30);
    const [concurrentThreads, setConcurrentThreads] = useState(3);
    const [requestDelay, setRequestDelay] = useState(500);
    const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
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
                try {
                    const finishedChunks = chunks.filter(c => c.status === 'finished' && c.audioUrl);
                    if (finishedChunks.length === 0) return;

                    const blobs = await Promise.all(
                        finishedChunks.map(chunk => fetch(chunk.audioUrl!).then(res => res.blob()))
                    );
                    const mergedBlob = new Blob(blobs, { type: 'audio/mpeg' });
                    
                    setMergedAudioUrl(prev => {
                        if (prev) URL.revokeObjectURL(prev);
                        return URL.createObjectURL(mergedBlob);
                    });
                } catch (error) {
                    console.error("Gộp file âm thanh thất bại:", error);
                }
            };
            mergeAudio();
        } else if (processingState === 'processing' || totalChunksCount === 0) {
            if (mergedAudioUrl) {
                URL.revokeObjectURL(mergedAudioUrl);
                setMergedAudioUrl(null);
            }
        }
    }, [processingState, totalChunksCount, failedChunksCount]); // Removed chunks from deps to avoid re-running on every chunk update

    const addContent = useCallback((content: string | Array<{ text: string; timestamp: string }>) => {
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
                });
                if (!signal.aborted) {
                    updateChunk(chunk.id, { status: 'finished', audioUrl });
                }
            } catch (err: any) {
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

    const handleDownloadAll = useCallback(() => {
        if (!mergedAudioUrl) return;
        const a = document.createElement('a');
        a.href = mergedAudioUrl;
        a.download = 'audio_merged.mp3';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }, [mergedAudioUrl]);
    
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
                mergedAudioUrl={mergedAudioUrl}
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
