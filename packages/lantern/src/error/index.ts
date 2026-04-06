export function panic(message: string): never {
	process.stderr.write(`\n  lantern: ${message}\n\n`);
	process.exit(1);
}
