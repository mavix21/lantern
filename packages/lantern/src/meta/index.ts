import os from 'os';
import matter from 'gray-matter';

export type Meta = {
	author: string;
	date: string;
	paging: string;
	theme: string;
};

export type Model = {
	data: Meta;
	content: string;
};

function defaultAuthor(): string {
	return os.userInfo().username;
}

function defaultDate(): string {
	const now = new Date();
	return now.toISOString().split('T')[0] ?? '';
}

export function parseMeta(fileContent: string): Model {
	const { data, content } = matter(fileContent);
	return {
		data: {
			author: data.author ?? defaultAuthor(),
			date: data.date ?? defaultDate(),
			paging: data.paging ?? 'Slide %d / %d',
			theme: data.theme ?? 'default',
		},
		content,
	};
}
