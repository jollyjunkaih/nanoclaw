import { execFile } from 'child_process';

export function runJxa(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], {
      timeout: 30_000,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(`JXA error: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}
