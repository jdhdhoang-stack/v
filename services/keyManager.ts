
export type TaskType = 'tts' | 'image_video' | 'translate';

class KeyManager {
    private STORAGE_KEY = 'puch_manual_api_keys';
    private badKeys: Set<string> = new Set();

    public saveKeys(keysString: string) {
        localStorage.setItem(this.STORAGE_KEY, keysString);
        this.badKeys.clear();
    }

    public getKeysRaw(): string {
        const existing = localStorage.getItem(this.STORAGE_KEY);
        if (!existing) {
            // Generate a random 12-digit numerical key if none exists
            const randomKey = Math.floor(Math.random() * 900000000000 + 100000000000).toString();
            this.saveKeys(randomKey);
            return randomKey;
        }
        return existing;
    }

    public regenerateKey() {
        const newKey = Math.floor(Math.random() * 900000000000 + 100000000000).toString();
        this.saveKeys(newKey);
    }

    private getAllKeys(): string[] {
        return this.getKeysRaw()
            .split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);
    }

    /**
     * Get API key based on task type.
     * Row 1: tts
     * Row 2: image_video
     * Row 3: translate
     */
    public getKey(task: TaskType): string {
        // Favor process.env.API_KEY for Gemini tasks (image_video and translate) to align with exclusive usage guidelines.
        if ((task === 'image_video' || task === 'translate') && process.env.API_KEY) {
            return process.env.API_KEY;
        }

        const keys = this.getAllKeys();
        let primaryKey = '';

        // Chọn key chính theo dòng
        if (task === 'tts') primaryKey = keys[0] || '';
        else if (task === 'image_video') primaryKey = keys[1] || '';
        else if (task === 'translate') primaryKey = keys[2] || '';

        // Nếu key chính hoạt động và chưa bị đánh dấu lỗi
        if (primaryKey && !this.badKeys.has(primaryKey)) {
            return primaryKey;
        }

        // Nếu không có key chính hoặc key chính lỗi, dùng pool dự phòng (dòng 3/4 trở đi tùy task)
        const fallbackStartIndex = task === 'translate' ? 3 : 2;
        const fallbackPool = keys.slice(fallbackStartIndex);
        for (const fbKey of fallbackPool) {
            if (!this.badKeys.has(fbKey)) {
                return fbKey;
            }
        }

        // Cuối cùng, nếu không còn key nào, thử dùng key hệ thống
        return process.env.API_KEY || primaryKey || (keys[0] || '');
    }

    public markKeyAsBad(key: string) {
        if (key) {
            this.badKeys.add(key);
            console.warn(`API Key ${key.substring(0, 8)}... đã bị đánh dấu lỗi và sẽ bị bỏ qua.`);
        }
    }
}

export const keyManager = new KeyManager();
