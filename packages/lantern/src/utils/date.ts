const tokenReplacers: [string, (d: Date) => string][] = [
	['YYYY', (d) => String(d.getFullYear())],
	['YY', (d) => String(d.getFullYear()).slice(-2)],
	['MMMM', (d) => d.toLocaleString('en-US', { month: 'long' })],
	['MMM', (d) => d.toLocaleString('en-US', { month: 'short' })],
	['MM', (d) => String(d.getMonth() + 1).padStart(2, '0')],
	['mm', (d) => String(d.getMonth() + 1)],
	['DD', (d) => String(d.getDate()).padStart(2, '0')],
	['dd', (d) => String(d.getDate())],
];

export function formatDate(pattern: string, date?: Date): string {
	const d = date ?? new Date();
	let result = pattern;

	for (const [token, replacer] of tokenReplacers) {
		result = result.replaceAll(token, replacer(d));
	}

	return result;
}

export function resolveDate(value: string): string {
	const formatted = formatDate(value);
	if (formatted === value) {
		return value;
	}
	return formatted;
}
