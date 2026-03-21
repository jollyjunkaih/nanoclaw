import { execFile } from 'child_process';

export function runShortcut(name: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['run', name];
    if (input) {
      args.push('-i', input);
    }

    execFile('shortcuts', args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Shortcut "${name}" failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}
