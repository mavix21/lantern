import { execSync } from 'node:child_process';
import os from 'node:os';

export const getUserFullName = (): string => {
	try {
		switch (process.platform) {
			case 'darwin': {
				return execSync('id -F', { encoding: 'utf-8' }).trim();
			}
			case 'linux': {
				const username = os.userInfo().username;
				const entry = execSync(`getent passwd ${username}`, {
					encoding: 'utf-8',
				}).trim();
				const gecos = entry.split(':')[4] ?? '';
				const name = gecos.split(',')[0] ?? '';
				return name;
			}
			case 'win32': {
				const out = execSync(
					'powershell -NoProfile -Command "(Get-CimInstance Win32_UserAccount -Filter \\"Name=\'$env:USERNAME\'\\").FullName"',
					{ encoding: 'utf-8' },
				).trim();
				return out;
			}
			default:
				return '';
		}
	} catch {
		return '';
	}
};
