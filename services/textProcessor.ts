
import * as mammoth from 'mammoth';

export class TextProcessor {
    private maxChars: number;
    private minCharsToMerge: number;

    // Pre-compile regex for performance
    private static readonly LINE_BREAKS_REGEX = /\r\n|\r/g;
    private static readonly MULTI_NEWLINE_REGEX = /\n{2,}/g;
    private static readonly CONTROL_CHARS_REGEX = /[\x00-\x08\x0b-\x1f\x7f]/g;
    private static readonly MULTI_SPACE_REGEX = /[ \t]+/g;
    private static readonly VIETNAMESE_ABBR_REGEX = /(TP|P|Q|H|T|S|P\.S|V\.V|V\.N|T\.P|Q\.L|N\.X\.B|T\.S|K\.S|B\.S|T\.H|T\.C|C\.T|C\.P|U\.B|H\.Đ|N\.D|N\.N|T\.Ư|T\.T|P\.T|P\.V|C\.A|Q\.Đ|H\.Q|T\.C|T\.D|T\.L|K\.T|X\.H|V\.H|G\.D|Y\.T|K\.H|C\.N|M\.T|D\.V|T\.M|B\.L|H\.S|K\.L|T\.N|P\.L|Q\.T|H\.Đ|N\.Q|C\.Q|T\.B|H\.B|P\.B|T\.C|V\.P|B\.T|T\.G|T\.K|T\.P|T\.X|H\.T|X\.T|C\.T|N\.T|P\.T|D\.T|K\.T|V\.T|S\.T|B\.T|L\.T|M\.T|N\.T|P\.T|Q\.T|R\.T|S\.T|T\.T|U\.T|V\.T|W\.T|X\.T|Y\.T|Z\.T)\./gi;
    private static readonly SENTENCE_SPLIT_REGEX = /(?<=[.?!])\s+/;

    constructor(maxChars: number = 1500, minCharsToMerge: number = 30) {
        if (maxChars <= 0) {
            throw new Error("max_chars must be a positive number.");
        }
        this.maxChars = maxChars;
        this.minCharsToMerge = minCharsToMerge;
    }

    private cleanText(text: string): string {
        let cleaned = text.replace(TextProcessor.LINE_BREAKS_REGEX, '\n');
        cleaned = cleaned.replace(TextProcessor.MULTI_NEWLINE_REGEX, '\n');
        cleaned = cleaned.replace(TextProcessor.CONTROL_CHARS_REGEX, '');
        const lines = cleaned.split('\n');
        const cleanedLines = lines.map(line => line.replace(TextProcessor.MULTI_SPACE_REGEX, ' ').trim());
        return cleanedLines.join('\n').trim();
    }

    private splitLongSentence(sentence: string): string[] {
        const subSentences: string[] = [];
        let currentPart = sentence;
        const delimiters = ['. ', ', ', '! ', '? ', ': ', '; ', ' '];
        
        while (currentPart.length > this.maxChars) {
            let cutPos = -1;
            for (const delim of delimiters) {
                const foundPos = currentPart.lastIndexOf(delim, this.maxChars);
                if (foundPos !== -1) {
                    cutPos = foundPos + delim.length;
                    break;
                }
            }
            if (cutPos === -1) {
                cutPos = this.maxChars;
            }
            subSentences.push(currentPart.substring(0, cutPos).trim());
            currentPart = currentPart.substring(cutPos).trim();
        }
        if (currentPart) {
            subSentences.push(currentPart);
        }
        return subSentences;
    }

    public process(text: string): string[] {
        const cleanedText = this.cleanText(text);
        // Protect abbreviations from being split
        const protectedText = cleanedText.replace(TextProcessor.VIETNAMESE_ABBR_REGEX, (match) => match.replace(/\./g, '___DOT___'));
        
        const paragraphs = protectedText.split('\n').filter(p => p);
        const allSentences: string[] = [];

        for (const para of paragraphs) {
            const sentencesInPara = para.split(TextProcessor.SENTENCE_SPLIT_REGEX)
                                       .map(s => s.trim())
                                       .filter(s => s)
                                       .map(s => s.replace(/___DOT___/g, '.'));
            allSentences.push(...sentencesInPara);
        }
        
        const chunks: string[] = [];
        let currentChunk = "";

        for (const sentence of allSentences) {
            if (sentence.length > this.maxChars) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                currentChunk = "";
                chunks.push(...this.splitLongSentence(sentence));
                continue;
            }
            if (currentChunk.length + sentence.length + 1 > this.maxChars) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                currentChunk = sentence;
            } else {
                currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk);
        }

        if (chunks.length >= 2 && chunks[chunks.length - 1].length < this.minCharsToMerge) {
            const lastChunk = chunks.pop()!;
            const secondToLastChunk = chunks[chunks.length - 1];

            if (secondToLastChunk.length + lastChunk.length + 1 <= this.maxChars) {
                chunks[chunks.length - 1] += " " + lastChunk;
            } else {
                const sentencesInChunk = secondToLastChunk.split(TextProcessor.SENTENCE_SPLIT_REGEX);
                if (sentencesInChunk.length > 1) {
                    const sentenceToMove = sentencesInChunk.pop()!;
                    const newLastChunk = `${sentenceToMove} ${lastChunk}`;

                    if (newLastChunk.length <= this.maxChars) {
                        chunks[chunks.length - 1] = sentencesInChunk.join(" ");
                        chunks.push(newLastChunk);
                    } else {
                         chunks.push(lastChunk); 
                    }
                } else {
                    chunks.push(lastChunk);
                }
            }
        }
        return chunks.filter(c => c.length > 0);
    }
    
    public static async processFromFile(file: File): Promise<string | Array<{ text: string; timestamp: string }>> {
        const extension = file.name.split('.').pop()?.toLowerCase();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onerror = () => reject(new Error(`Đọc file .${extension} thất bại`));

            if (extension === 'txt') {
                 reader.onload = (e) => {
                    resolve(e.target?.result as string);
                };
                reader.readAsText(file);
            } else if (extension === 'srt') {
                reader.onload = (e) => {
                    const content = e.target?.result as string;
                    // SRT Parser: Sequence, Timing, Text, empty line
                    const srtRegex = /(\d+)\r?\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n?$)/g;
                    const items: Array<{ text: string; timestamp: string }> = [];
                    let match;
                    
                    while ((match = srtRegex.exec(content)) !== null) {
                        const start = match[2];
                        const text = match[4].replace(/<[^>]*>/g, '').replace(/\r?\n/g, ' ').trim();
                        if (text) {
                            items.push({ text, timestamp: start });
                        }
                    }
                    
                    if (items.length === 0) {
                        // Fallback: try simple split if regex fails
                        const lines = content.split(/\r?\n\r?\n/);
                        lines.forEach(block => {
                            const linesInBlock = block.split(/\r?\n/);
                            if (linesInBlock.length >= 3) {
                                const timestamp = linesInBlock[1].split(' --> ')[0];
                                const text = linesInBlock.slice(2).join(' ').replace(/<[^>]*>/g, '').trim();
                                if (text) items.push({ text, timestamp });
                            }
                        });
                    }

                    resolve(items);
                };
                reader.readAsText(file);
            } else if (extension === 'docx') {
                if (typeof mammoth === 'undefined') {
                    return reject(new Error('Thư viện xử lý DOCX (mammoth.js) chưa được tải.'));
                }
                reader.onload = async (e) => {
                    try {
                        const arrayBuffer = e.target?.result as ArrayBuffer;
                        const result = await mammoth.extractRawText({ arrayBuffer });
                        resolve(result.value);
                    } catch (err) {
                        reject(new Error('Phân tích file .docx thất bại.'));
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                reject(new Error(`Định dạng tệp không được hỗ trợ: .${extension}`));
            }
        });
    }
}
