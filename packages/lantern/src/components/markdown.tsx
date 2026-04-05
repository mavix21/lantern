import * as React from 'react';
import { Text } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import type { Tokens } from 'marked';
import chalk from 'chalk';

type Props = {
	children: string;
};

const ext = markedTerminal({
	// chalk.bold (SGR 1) is often rendered as "bright intensity" rather than
	// bold font-weight, making it invisible when the default foreground is
	// already bright. Combine with whiteBright to guarantee contrast.
	firstHeading: (text: string) => chalk.magentaBright.inverse(` ${text} `),
	strong: chalk.magenta.bold,
	codespan: chalk.bgBlack.whiteBright,
	tab: 2,
});

// Fix: marked-terminal's text renderer uses `token.text` (the raw string)
// instead of parsing inline tokens, so bold, codespan, etc. inside tight
// list items are never styled. Override it to call parseInline when tokens
// are available.
const origText = ext.renderer!.text!;
ext.renderer!.text = function (token: Tokens.Text | Tokens.Escape) {
	if ('tokens' in token && token.tokens && token.tokens.length > 0) {
		return this.parser.parseInline(token.tokens);
	}
	return origText.call(this, token);
};

// Fix: in marked v17, list item tokens include a `checkbox` token that the
// parser renders via the extension. But marked-terminal's listitem() also
// prepends a checkbox by calling r.checkbox() directly on the prototype,
// causing duplication. Neutralise the extension-level checkbox renderer so
// only the manual one from listitem() survives.
ext.renderer!.checkbox = function () {
	return '';
};

// Fix: marked-terminal's blockquote renderer applies the styling function
// to the entire text as one string, so a left-border prefix only appears
// on the first line. Override the renderer to add a │ bar to every line.
const BAR = chalk.gray('│');
ext.renderer!.blockquote = function (quote: Tokens.Blockquote | string) {
	if (typeof quote === 'object') {
		quote = this.parser.parse(quote.tokens);
	}
	const bordered = (quote as string)
		.trim()
		.split('\n')
		.map((line: string) => `${BAR} ${line}`)
		.join('\n');
	return '\n' + bordered + '\n\n';
};

const marked = new Marked(ext);

export default function Markdown({ children }: Props): React.JSX.Element {
	const rendered = React.useMemo(
		() => (marked.parse(children) as string).trimEnd(),
		[children],
	);

	return <Text>{rendered}</Text>;
}
