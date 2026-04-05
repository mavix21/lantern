import { defineWorkspace } from 'bunup';

// https://bunup.dev/docs/guide/workspaces

export default defineWorkspace([
	{
		name: 'lantern',
		root: 'packages/lantern',
		config: {
			entry: ['src/index.ts', 'src/cli.tsx'],
		},
	},
]);
