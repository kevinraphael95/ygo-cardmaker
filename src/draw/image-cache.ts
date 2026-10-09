const DB_NAME = 'ygo-image-cache';
const DB_VERSION = 1;
const STORE = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'url' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
};

export const getCachedImage = async (url: string): Promise<Blob | null> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(url);
            req.onsuccess = () => {
                const entry = req.result;
                if (entry && entry.blob instanceof Blob) {
                    const age = Date.now() - (entry.ts || 0);
                    if (age < 30 * 24 * 60 * 60 * 1000) {
                        resolve(entry.blob);
                        return;
                    }
                }
                resolve(null);
            };
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
};

export const setCachedImage = async (url: string, blob: Blob): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({ url, blob, ts: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // silencieux
    }
};

export const clearImageCache = async (): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // silencieux
    }
};

export const getImageCacheStats = async (): Promise<{ count: number; sizeMB: number }> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => {
                const all = req.result || [];
                const totalBytes = all.reduce((sum: number, item: any) => sum + (item.blob?.size || 0), 0);
                resolve({
                    count: all.length,
                    sizeMB: Math.round(totalBytes / 1024 / 1024 * 10) / 10,
                });
            };
            req.onerror = () => resolve({ count: 0, sizeMB: 0 });
        });
    } catch {
        return { count: 0, sizeMB: 0 };
    }
};

// ⚡ Exposition globale pour tests dans la console
if (typeof window !== 'undefined') {
    (window as any).getImageCacheStats = getImageCacheStats;
    (window as any).clearImageCache = clearImageCache;
}
