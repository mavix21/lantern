#!/usr/bin/env node
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import App from './app.js';
import { parseMeta } from './meta/index.js';
import { panic } from './error/index.js';

function splitSlides(content: string): string[] {
	const lines = content.split('\n');
	const slides: string[] = [];
	let current: string[] = [];
	let inCodeBlock = false;

	for (const line of lines) {
		if (line.startsWith('```')) {
			inCodeBlock = !inCodeBlock;
		}

		if (!inCodeBlock && line === '---' && current.length > 0) {
			slides.push(current.join('\n'));
			current = [];
		} else {
			current.push(line);
		}
	}

	if (current.length > 0) {
		slides.push(current.join('\n'));
	}

	return slides;
}

const parseArgs = () =>
	yargs(hideBin(process.argv))
		.command('$0 <file>', 'present markdown file as slides', (yargs) => {
			return yargs.positional('file', {
				describe: 'path to the markdown file',
				type: 'string',
				demandOption: true,
			});
		})
		.strict()
		.parse();

async function loadSlides(filePath: string) {
	const resolved = path.resolve(filePath);

	// Verify the path points to a readable file
	let info;
	try {
		info = await stat(resolved);
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'ENOENT') {
			panic(`file not found: ${resolved}`);
		} else if (code === 'EACCES') {
			panic(`permission denied: ${resolved}`);
		} else {
			panic(`cannot access file: ${resolved}`);
		}
	}

	if (!info.isFile()) {
		panic(`not a file: ${resolved}`);
	}

	let raw: string;
	try {
		raw = await readFile(resolved, 'utf-8');
	} catch {
		panic(`could not read file: ${resolved}`);
	}

	raw = raw.replaceAll('\r', '');

	const meta = parseMeta(raw);
	const slides = splitSlides(meta.content);

	if (slides.every((s) => s.trim() === '')) {
		panic('the file contains no slides');
	}

	return { slides, meta: meta.data };
}

async function main() {
	const argv = await parseArgs();
	const filePath = path.resolve(argv.file as string);
	const { slides, meta } = await loadSlides(filePath);

	// Enter alternate screen buffer (same as vim, htop, less, etc.)
	process.stdout.write('\x1b[?1049h');

	const basePath = path.dirname(filePath);
	const instance = render(
		<App slides={slides} meta={meta} basePath={basePath} />,
	);

	// Watch for file changes and re-render
	let debounce: NodeJS.Timeout;
	const watcher = watch(filePath, () => {
		clearTimeout(debounce);
		debounce = setTimeout(async () => {
			try {
				const updated = await loadSlides(filePath);
				instance.rerender(
					<App
						slides={updated.slides}
						meta={updated.meta}
						basePath={basePath}
					/>,
				);
			} catch {
				// Ignore transient read errors during saves
			}
		}, 50);
	});

	// Restore original screen on exit
	instance.waitUntilExit().then(() => {
		watcher.close();
		process.stdout.write('\x1b[?1049l');
	});
}

main().catch((err: unknown) => {
	panic(err instanceof Error ? err.message : String(err));
});
