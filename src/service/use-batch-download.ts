import { create } from 'zustand';
import { getCachedImage, setCachedImage } from 'src/draw/image-cache';

// ════════════════════════════════════════════════════════════════════════════
// ⚡ PRÉCHARGEMENT PARALLÈLE DES ILLUSTRATIONS
// ════════════════════════════════════════════════════════════════════════════
// Quand un batch démarre, on précharge toutes les images en parallèle (6 à la
// fois max) → les illustrations sont en cache IDB avant d'être utilisées.
// Résultat : le batch qui était séquentiel devient quasi-instantané.
// ════════════════════════════════════════════════════════════════════════════

const CORS_PROXY = 'https://images.weserv.nl/?url=';
const PRELOAD_CONCURRENCY = 6;

const preloadOneImage = async (cardId: string): Promise<'ok' | 'cached' | 'fail'> => {
    const rawUrl = `https://images.ygoprodeck.com/images/cards_cropped/${cardId}.jpg`;
    try {
        // Déjà en cache ?
        const cached = await getCachedImage(rawUrl);
        if (cached) return 'cached';

        // Sinon → fetch via proxy
        const proxyUrl = CORS_PROXY + encodeURIComponent(
            `images.ygoprodeck.com/images/cards_cropped/${cardId}.jpg`
        );
        const res = await fetch(proxyUrl, { mode: 'cors' });
        if (!res.ok) return 'fail';  // 404 sur les cartes custom
        const blob = await res.blob();
        await setCachedImage(rawUrl, blob);
        return 'ok';
    } catch {
        return 'fail';
    }
};

const preloadAllCardImages = async (cardIds: string[]): Promise<void> => {
    const queue = [...cardIds];
    let done = 0;
    let ok = 0;
    let cached = 0;
    let failed = 0;
    const total = queue.length;

    console.log(`[Batch] ⚡ Préchargement de ${total} images (${PRELOAD_CONCURRENCY} en parallèle)…`);

    const worker = async () => {
        while (queue.length > 0) {
            const id = queue.shift();
            if (!id) break;
            const result = await preloadOneImage(id);
            done++;
            if (result === 'ok') ok++;
            else if (result === 'cached') cached++;
            else failed++;

            // Log tous les 50
            if (done % 50 === 0 || done === total) {
                console.log(`[Batch] Préchargé ${done}/${total} · ${ok} nouveaux · ${cached} en cache · ${failed} échecs`);
            }
        }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < PRELOAD_CONCURRENCY; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    console.log(`[Batch] ✅ Préchargement terminé : ${ok} nouveaux, ${cached} en cache, ${failed} échecs`);
};

// ════════════════════════════════════════════════════════════════════════════

export type BatchDownloadStore = {
    batchName: string,
    batchQueue: string[],
    batchDataMap: Record<string, { name: string, blob: Blob }>,
    isBatchDownloading: boolean,
    isReady: boolean,
    startBatchDownload: (batchName: string, batchQueue: string[]) => void,
    stopBatchDownload: () => void,
    clearQueue: () => void,
    addToBatch: (cardId: string, cardName: string, cardBlob: Blob) => void,
};
export const useBatchDownload = create<BatchDownloadStore>((set, get) => {
    return {
        batchName: '',
        batch: undefined,
        batchQueue: [],
        batchDataMap: {},
        isBatchDownloading: false,
        isReady: false,
        startBatchDownload: (batchName, batchQueue) => {
            set({
                batchName,
                batchQueue,
                isBatchDownloading: true,
            });

            // ⚡ Préchargement en arrière-plan : télécharge toutes les images
            //    en parallèle pour que le batch soit quasi-instantané ensuite.
            preloadAllCardImages(batchQueue).catch(err => {
                console.warn('[Batch] Préchargement échoué', err);
            });
        },
        stopBatchDownload: () => {
            set({
                batchName: '',
                batchQueue: [],
                batchDataMap: {},
                isBatchDownloading: false,
                isReady: false,
            });
        },
        clearQueue: () => {
            set({
                batchQueue: [],
            });
        },
        addToBatch: (cardId, cardName, cardBlob) => {
            set(({ batchQueue, batchDataMap }) => {
                const nextQueue = batchQueue.filter(id => id !== cardId);
                const nextBatchDataMap = { ...batchDataMap };
                nextBatchDataMap[cardId] = { name: cardName, blob: cardBlob };

                return {
                    batchQueue: nextQueue,
                    batchDataMap: nextBatchDataMap,
                    isReady: nextQueue.length === 0 ? true : false,
                };
            });
        },
    };
});
