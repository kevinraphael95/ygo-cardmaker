import { create } from 'zustand';
import { getCachedImage, setCachedImage } from 'src/draw/image-cache';
import { useCardList } from './use-card-list';

// ════════════════════════════════════════════════════════════════════════════
// ⚡ PRÉCHARGEMENT PARALLELE AVEC FALLBACK NOM → ID
// ════════════════════════════════════════════════════════════════════════════
// Problème : les cartes custom (VAACT, ProjectIgnis…) ont des IDs 910001XXX
// qui n'existent pas sur YGOPRODeck → 404 → lent + image blanche.
//
// Solution : si l'ID n'est pas un passcode Konami (< 8 chiffres), on cherche
// l'ID réel via l'API YGOPRODeck par nom, puis on télécharge l'image.
// ════════════════════════════════════════════════════════════════════════════

const CORS_PROXY = 'https://images.weserv.nl/?url=';
const PRELOAD_CONCURRENCY = 6;

// Cache mémoire pour éviter de chercher 2x le même nom
const nameToIdCache = new Map<string, string | null>();

const resolveIdByName = async (cardName: string): Promise<string | null> => {
    if (!cardName || cardName.length < 3) return null;
    if (nameToIdCache.has(cardName)) return nameToIdCache.get(cardName) ?? null;

    try {
        const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`;
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) {
            nameToIdCache.set(cardName, null);
            return null;
        }
        const data = await res.json();
        const card = data?.data?.[0];
        const realId = card?.id ? String(card.id) : null;
        nameToIdCache.set(cardName, realId);
        return realId;
    } catch {
        nameToIdCache.set(cardName, null);
        return null;
    }
};

const preloadOneImage = async (
    cardId: string,
    cardName: string,
): Promise<'ok' | 'cached' | 'fail' | 'skip'> => {
    // ⚡ Détermine l'ID YGOPRODeck à utiliser
    let ygoprodeckId: string | null = null;

    // ID numérique court (< 8 chiffres) = probablement un vrai passcode Konami
    if (/^\d{1,8}$/.test(cardId)) {
        ygoprodeckId = cardId;
    } else {
        // ID custom (hash, 910001XXX…) → chercher par nom
        ygoprodeckId = await resolveIdByName(cardName);
    }

    if (!ygoprodeckId) return 'skip';

    const rawUrl = `https://images.ygoprodeck.com/images/cards_cropped/${ygoprodeckId}.jpg`;
    try {
        const cached = await getCachedImage(rawUrl);
        if (cached) return 'cached';

        const proxyUrl = CORS_PROXY + encodeURIComponent(
            `images.ygoprodeck.com/images/cards_cropped/${ygoprodeckId}.jpg`
        );
        const res = await fetch(proxyUrl, { mode: 'cors' });
        if (!res.ok) return 'fail';
        const blob = await res.blob();
        await setCachedImage(rawUrl, blob);
        return 'ok';
    } catch {
        return 'fail';
    }
};

const preloadAllCardImages = async (
    cards: { id: string; name: string }[],
): Promise<void> => {
    const queue = [...cards];
    let done = 0, ok = 0, cached = 0, failed = 0, skipped = 0;
    const total = queue.length;

    console.log(`[Batch] ⚡ Préchargement de ${total} images (${PRELOAD_CONCURRENCY} en parallèle)…`);

    const worker = async () => {
        while (queue.length > 0) {
            const card = queue.shift();
            if (!card) break;
            const result = await preloadOneImage(card.id, card.name);
            done++;
            if (result === 'ok') ok++;
            else if (result === 'cached') cached++;
            else if (result === 'fail') failed++;
            else skipped++;

            if (done % 50 === 0 || done === total) {
                console.log(`[Batch] ${done}/${total} · ${ok} nouveaux · ${cached} cache · ${failed} échecs · ${skipped} skip`);
            }
        }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < PRELOAD_CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

    console.log(`[Batch] ✅ Préchargement terminé : ${ok} nouveaux, ${cached} en cache, ${failed} échecs, ${skipped} skip`);
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

            // ⚡ Récupère les noms depuis cardList pour le fallback nom→ID
            const { cardList } = useCardList.getState();
            const cardsWithNames = batchQueue.map(id => {
                const card = cardList.find(c => c.id === id);
                return { id, name: card?.name ?? '' };
            });

            preloadAllCardImages(cardsWithNames).catch(err => {
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
