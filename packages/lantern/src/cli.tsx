#!/usr/bin/env node
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import App from './app.js';
import { parseMeta } from './meta/index.js';
import { panic } from './error/index.js';

const SLIDE_DELIMITER = '\n---\n';

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
	const slides = meta.content.split(SLIDE_DELIMITER);

	if (slides.every((s) => s.trim() === '')) {
		panic('the file contains no slides');
	}

	return { slides, meta: meta.data };
}

async function main() {
	const argv = await parseArgs();
	const { slides, meta } = await loadSlides(argv.file as string);

	// Enter alternate screen buffer (same as vim, htop, less, etc.)
	process.stdout.write('\x1b[?1049h');

	const instance = render(<App slides={slides} meta={meta} />);

	// Restore original screen on exit
	instance.waitUntilExit().then(() => {
		process.stdout.write('\x1b[?1049l');
	});
}

main().catch((err: unknown) => {
	panic(err instanceof Error ? err.message : String(err));
});
