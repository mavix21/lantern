import * as React from 'react';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import chalk from 'chalk';

export type ImageRef = {
	href: string;
	alt: string;
	title: string | null;
};

export type CachedImage = {
	text: string;
	rawData?: string;
};

// ── Protocol detection ──────────────────────────────────────────────
// Native protocols render at full pixel resolution inside the terminal.
// Block characters are a universal fallback (~1px per column).
// Exported so the Markdown component knows when to use direct stdout writes.
export type ImageProtocol = 'iterm2' | 'kitty' | 'block';

function detectProtocol(): ImageProtocol {
	const tp = process.env['TERM_PROGRAM'] ?? '';
	const lt = process.env['LC_TERMINAL'] ?? '';
	const term = process.env['TERM'] ?? '';
	if (term === 'xterm-kitty' || tp === 'ghostty') return 'kitty';
	if (tp === 'iTerm.app' || tp === 'WezTerm' || lt === 'iTerm2')
		return 'iterm2';
	return 'block';
}

export const imageProtocol: ImageProtocol = detectProtocol();

// ── iTerm2 inline image protocol ────────────────────────────────────
// Returns spacer newlines as `text` (for ink layout) and the raw OSC
// escape sequence as `rawData` (written directly to stdout by the
// component, bypassing ink's text wrapping which would corrupt it).
async function renderITerm2(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<CachedImage> {
	const [fileBuffer, meta] = await Promise.all([
		readFile(filePath),
		sharp(filePath).metadata(),
	]);
	if (!meta.width || !meta.height) throw new Error('unreadable image');

	const imgAspect = meta.height / meta.width;
	const estimatedRows = Math.min(
		maxRows,
		Math.max(1, Math.ceil((maxCols * imgAspect) / 2)),
	);

	const b64 = fileBuffer.toString('base64');
	const rawData =
		`\x1b]1337;File=inline=1;height=${estimatedRows}` +
		`;preserveAspectRatio=1;size=${fileBuffer.length}:${b64}\x07`;

	const text = '\n'.repeat(estimatedRows);
	return { text, rawData };
}

// ── Kitty graphics protocol ─────────────────────────────────────────
// Returns spacer newlines as `text` and chunked APC escape sequences as
// `rawData` for direct stdout write.
async function renderKitty(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<CachedImage> {
	const meta = await sharp(filePath).metadata();
	if (!meta.width || !meta.height) throw new Error('unreadable image');

	const imgAspect = meta.height / meta.width;
	const estimatedRows = Math.min(
		maxRows,
		Math.max(1, Math.ceil((maxCols * imgAspect) / 2)),
	);

	const pngBuffer = await sharp(filePath).png().toBuffer();
	const b64 = pngBuffer.toString('base64');

	let rawData = '';
	const chunkSize = 4096;
	for (let i = 0; i < b64.length; i += chunkSize) {
		const chunk = b64.slice(i, i + chunkSize);
		const isFirst = i === 0;
		const isLast = i + chunkSize >= b64.length;
		if (isFirst) {
			rawData += `\x1b_Gf=100,a=T,r=${estimatedRows},m=${isLast ? 0 : 1};${chunk}\x1b\\`;
		} else {
			rawData += `\x1b_Gm=${isLast ? 0 : 1};${chunk}\x1b\\`;
		}
	}

	const text = '\n'.repeat(estimatedRows);
	return { text, rawData };
}

// ── Block-character fallback ────────────────────────────────────────
// Uses ▄ (lower half block): bg colour = top pixel, fg = bottom pixel.
// Gives 2 vertical pixels per character cell. Mild sharpening helps
// compensate for the inherent resolution loss.
const PIXEL = '\u2584';

async function renderBlock(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<CachedImage> {
	const image = sharp(filePath);
	const meta = await image.metadata();
	if (!meta.width || !meta.height) throw new Error('unreadable image');

	const maxPixelH = maxRows * 2;
	const scale = Math.min(maxCols / meta.width, maxPixelH / meta.height);
	const w = Math.max(1, Math.round(meta.width * scale));
	const h = Math.max(2, Math.round(meta.height * scale));

	const { data, info } = await image
		.resize(w, h, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
		.sharpen({ sigma: 0.5 })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const lines: string[] = [];
	for (let y = 0; y < info.height - 1; y += 2) {
		let line = '';
		for (let x = 0; x < info.width; x++) {
			const topOff = (y * info.width + x) * 3;
			const botOff = ((y + 1) * info.width + x) * 3;
			const tr = data[topOff]!,
				tg = data[topOff + 1]!,
				tb = data[topOff + 2]!;
			const br = data[botOff]!,
				bg = data[botOff + 1]!,
				bb = data[botOff + 2]!;
			line += chalk.bgRgb(tr, tg, tb).rgb(br, bg, bb)(PIXEL);
		}
		lines.push(line);
	}

	return { text: lines.join('\n') };
}

// ── Unified renderer ────────────────────────────────────────────────
async function renderImage(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<CachedImage> {
	if (imageProtocol === 'iterm2')
		return renderITerm2(filePath, maxCols, maxRows);
	if (imageProtocol === 'kitty') return renderKitty(filePath, maxCols, maxRows);
	return renderBlock(filePath, maxCols, maxRows);
}

// Global cache so images persist across slide navigation and re-renders.
const globalCache = new Map<string, CachedImage>();

/**
 * Asynchronously loads and renders images referenced in markdown slides.
 * Uses native terminal image protocols (iTerm2, Kitty) when available for
 * full pixel-quality rendering, falling back to ANSI block characters.
 * Returns a map of `href → CachedImage`.
 */
export function useTerminalImages(
	refs: ImageRef[],
	basePath: string,
	width: number,
	maxHeight: number,
): Map<string, CachedImage> {
	const [cache, setCache] = React.useState<Map<string, CachedImage>>(
		() => new Map(globalCache),
	);

	// Deduplicated list of hrefs that actually need loading.
	const hrefs = React.useMemo(() => {
		const unique = new Set<string>();
		for (const r of refs) {
			if (r.href) unique.add(r.href);
		}
		return [...unique];
	}, [refs]);

	React.useEffect(() => {
		let cancelled = false;

		async function load() {
			const pending = hrefs.filter((h) => !globalCache.has(h));
			if (pending.length === 0) return;

			for (const href of pending) {
				if (cancelled) return;
				try {
					const resolved = path.isAbsolute(href)
						? href
						: path.resolve(basePath, href);
					const rendered = await renderImage(resolved, width, maxHeight);
					globalCache.set(href, rendered);
				} catch {
					globalCache.set(href, { text: '' });
				}
			}

			if (!cancelled) {
				setCache(new Map(globalCache));
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [hrefs, basePath, width, maxHeight]);

	return cache;
}
