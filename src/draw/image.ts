import { CanvasTextStyle } from 'src/service';
import { setTextStyle } from './canvas-util';
import { getCachedImage, setCachedImage } from './image-cache';

const CORS_PROXY = 'https://images.weserv.nl/?url=';
const MAX_CONCURRENT_LOADS = 4;

let activeLoads = 0;
const loadQueue: Array<() => void> = [];

const acquireSlot = (): Promise<void> => {
    if (activeLoads < MAX_CONCURRENT_LOADS) {
        activeLoads++;
        return Promise.resolve();
    }
    return new Promise(resolve => {
        loadQueue.push(() => { activeLoads++; resolve(); });
    });
};

const releaseSlot = () => {
    activeLoads = Math.max(0, activeLoads - 1);
    const next = loadQueue.shift();
    if (next) next();
};

const isSameOrigin = (url: string): boolean => {
    if (!url) return true;
    if (url.startsWith('/')) return true;
    if (url.startsWith('data:')) return true;
    if (url.startsWith('blob:')) return true;
    return url.startsWith(window.location.origin);
};

const proxifyIfExternal = (url: string): string => {
    if (isSameOrigin(url)) return url;
    const cleaned = url.replace(/^https?:\/\//i, '');
    return CORS_PROXY + encodeURIComponent(cleaned);
};

const loadImageSrc = async (rawUrl: string, finalUrl: string): Promise<string> => {
    if (isSameOrigin(rawUrl)) return finalUrl;
    const cached = await getCachedImage(rawUrl);
    if (cached) return URL.createObjectURL(cached);
    const res = await fetch(finalUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    await setCachedImage(rawUrl, blob);
    return URL.createObjectURL(blob);
};

const imageCacheMap: Record<string, {
    image: HTMLImageElement,
    ready: boolean,
    error: boolean,
    cache: boolean,
}> = {};

export const drawFrom = async (
    ctx: CanvasRenderingContext2D | null | undefined,
    source: string,
    dx: number | ((image: HTMLImageElement) => number) = 0,
    dy: number | ((image: HTMLImageElement) => number) = 0,
) => {
    if (!ctx || source === '') return new Promise<boolean>(resolve => resolve(false));
    return new Promise<boolean>(resolve => {
        if (imageCacheMap[source]?.ready === true) {
            const image = imageCacheMap[source].image;
            const actualDX = typeof dx === 'number' ? dx : dx(image);
            const actualDY = typeof dy === 'number' ? dy : dy(image);
            ctx.drawImage(image, actualDX, actualDY);
            setTimeout(() => resolve(true), 0);
            return;
        }
        if (imageCacheMap[source]?.error) {
            setTimeout(() => resolve(true), 0);
            return;
        }

        const imageCached = imageCacheMap[source] && (imageCacheMap[source].cache || imageCacheMap[source].ready);
        const image = imageCached ? imageCacheMap[source].image : new Image();

        if (!imageCached) {
            image.crossOrigin = 'anonymous';
            const rawUrl = process.env.PUBLIC_URL + source;
            acquireSlot().then(async () => {
                try {
                    const src = await loadImageSrc(rawUrl, proxifyIfExternal(rawUrl));
                    image.src = src;
                } catch {
                    image.src = proxifyIfExternal(rawUrl);
                }
            });
        }
        image.addEventListener('load', () => {
            releaseSlot();
            const actualDX = typeof dx === 'number' ? dx : dx(image);
            const actualDY = typeof dy === 'number' ? dy : dy(image);
            ctx.drawImage(image, actualDX, actualDY);
            if (imageCacheMap[source]) {
                imageCacheMap[source].ready = true;
                imageCacheMap[source].error = false;
            }
            resolve(true);
        }, { once: true });
        image.addEventListener('error', () => {
            releaseSlot();
            if (imageCacheMap[source]) imageCacheMap[source].error = true;
            resolve(false);
        }, { once: true });

        if (!imageCached) imageCacheMap[source] = {
            image, ready: false, error: false, cache: true,
        };
    });
};

export const drawAsset = async (
    ctx: CanvasRenderingContext2D | null | undefined,
    source: string,
    dx: number | ((image: HTMLImageElement) => number) = 0,
    dy: number | ((image: HTMLImageElement) => number) = 0,
) => {
    return await drawFrom(ctx, '/asset/image/' + source, dx, dy);
};

const normalizeDxy = (
    image: HTMLImageElement,
    dw?: number | ((image: HTMLImageElement) => number),
    dh?: number | ((image: HTMLImageElement) => number),
) => {
    const { naturalWidth, naturalHeight } = image;
    const baseDW = typeof dw === 'number' ? dw : dw?.(image);
    const baseDH = typeof dh === 'number' ? dh : dh?.(image);
    let actualDW = naturalWidth;
    let actualDH = naturalHeight;
    if (typeof baseDH !== 'number' && typeof baseDW === 'number') {
        actualDW = baseDW;
        actualDH = actualDW * naturalHeight / naturalWidth;
    } else if (typeof baseDH === 'number' && typeof baseDW !== 'number') {
        actualDH = baseDH;
        actualDW = actualDH * naturalWidth / naturalHeight;
    } else if (typeof baseDH === 'number' && typeof baseDW === 'number') {
        actualDW = baseDW;
        actualDH = baseDH;
    }
    return { actualDH, actualDW };
};

export const drawFromWithSize = async (
    ctx: CanvasRenderingContext2D | null | undefined,
    source: string,
    dx: number | ((image: HTMLImageElement) => number),
    dy: number | ((image: HTMLImageElement) => number),
    dw?: number | ((image: HTMLImageElement) => number),
    dh?: number | ((image: HTMLImageElement) => number),
    sx?: undefined | number | ((image: HTMLImageElement) => number),
    sy?: undefined | number | ((image: HTMLImageElement) => number),
    sw?: undefined | number | ((image: HTMLImageElement) => number),
    sh?: undefined | number | ((image: HTMLImageElement) => number),
    option?: { cache?: boolean, internalImage?: boolean },
) => {
    const { cache = true, internalImage = true } = option ?? {};
    if (!ctx || source === '') return new Promise<boolean>(resolve => resolve(false));
    return new Promise<boolean>(resolve => {
        if (imageCacheMap[source]?.ready === true) {
            const image = imageCacheMap[source].image;
            const actualDX = typeof dx === 'number' ? dx : dx(image);
            const actualDY = typeof dy === 'number' ? dy : dy(image);
            const actualSX = typeof sx === 'number' ? sx : sx?.(image);
            const actualSY = typeof sy === 'number' ? sy : sy?.(image);
            const actualSW = typeof sw === 'number' ? sw : sw?.(image);
            const actualSH = typeof sh === 'number' ? sh : sh?.(image);
            const { actualDH, actualDW } = normalizeDxy(image, dw, dh);
            if (typeof actualSX === 'number' && typeof actualSY === 'number'
                && typeof actualSW === 'number' && typeof actualSH === 'number') {
                ctx.drawImage(image, actualSX, actualSY, actualSW, actualSH, actualDX, actualDY, actualDW, actualDH);
            } else {
                ctx.drawImage(image, actualDX, actualDY, actualDW, actualDH);
            }
            setTimeout(() => resolve(true), 0);
            return;
        }
        if (imageCacheMap[source]?.error) {
            setTimeout(() => resolve(true), 0);
            return;
        }

        const imageCached = imageCacheMap[source] && (imageCacheMap[source].cache || imageCacheMap[source].ready);
        const image = imageCached ? imageCacheMap[source].image : new Image();

        if (!imageCached) {
            image.crossOrigin = 'anonymous';
            const rawUrl = internalImage ? process.env.PUBLIC_URL + source : source;
            acquireSlot().then(async () => {
                try {
                    const src = await loadImageSrc(rawUrl, proxifyIfExternal(rawUrl));
                    image.src = src;
                } catch {
                    image.src = proxifyIfExternal(rawUrl);
                }
            });
        }
        image.addEventListener('load', () => {
            releaseSlot();
            const actualDX = typeof dx === 'number' ? dx : dx(image);
            const actualDY = typeof dy === 'number' ? dy : dy(image);
            const actualSX = typeof sx === 'number' ? sx : sx?.(image);
            const actualSY = typeof sy === 'number' ? sy : sy?.(image);
            const actualSW = typeof sw === 'number' ? sw : sw?.(image);
            const actualSH = typeof sh === 'number' ? sh : sh?.(image);
            const { actualDH, actualDW } = normalizeDxy(image, dw, dh);
            if (typeof actualSX === 'number' && typeof actualSY === 'number'
                && typeof actualSW === 'number' && typeof actualSH === 'number') {
                ctx.drawImage(image, actualSX, actualSY, actualSW, actualSH, actualDX, actualDY, actualDW, actualDH);
            } else {
                ctx.drawImage(image, actualDX, actualDY, actualDW, actualDH);
            }
            if (imageCacheMap[source]) {
                imageCacheMap[source].ready = true;
                imageCacheMap[source].error = false;
            }
            resolve(true);
        }, { once: true });
        image.addEventListener('error', () => {
            releaseSlot();
            if (imageCacheMap[source]) imageCacheMap[source].error = true;
            resolve(false);
        }, { once: true });

        if (cache && !imageCached) imageCacheMap[source] = {
            image, ready: false, error: false, cache: true,
        };
    });
};

export const drawAssetWithSize: typeof drawFromWithSize = async (
    ctx, source, dx, dy, dw, dh, sx, sy, sw, sh,
) => {
    return await drawFromWithSize(
        ctx, '/asset/image/' + source, dx, dy, dw, dh, sx, sy, sw, sh,
    );
};

export const drawWithStyle = async (
    canvas: HTMLCanvasElement,
    source: string,
    dx: number, dy: number,
    sw: number, sh: number,
    globalScale: number,
    style?: CanvasTextStyle,
) => {
    const ctx = canvas.getContext('2d');
    const clonedCanvas = document.createElement('canvas');
    clonedCanvas.width = sw;
    clonedCanvas.height = sh;
    const clonedCtx = clonedCanvas.getContext('2d', { willReadFrequently: true });

    if (!clonedCtx || !ctx) return;

    await drawAssetWithSize(clonedCtx, source, 0, 0, sw, sh);
    if (style?.color) {
        clonedCtx.fillStyle = style.color;
        clonedCtx.fillRect(0, 0, sw, sh);
        clonedCtx.globalCompositeOperation = 'destination-in';
    }
    await drawAssetWithSize(clonedCtx, source, 0, 0, sw, sh);
    clonedCtx.globalCompositeOperation = 'source-over';

    const resetMainCanvasStyle = setTextStyle({ ctx, ...style, globalScale });
    ctx.drawImage(clonedCanvas, dx, dy);
    resetMainCanvasStyle();
};
