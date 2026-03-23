import { execFile } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export function runJxa(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], {
      timeout: 30_000,
    }, (err, stdout, stderr) => {
      // osascript may exit non-zero but still produce valid stdout
      // (e.g. AppleEvent permission warnings on stderr). Prefer stdout.
      if (stdout && stdout.trim()) {
        resolve(stdout.trim());
      } else if (err) {
        reject(new Error(`JXA error: ${stderr || err.message}`));
      } else {
        resolve('');
      }
    });
  });
}

export function runAppleScript(script: string): Promise<string> {
  // Write to a temp file to avoid escaping issues with -e
  const tmpFile = join(tmpdir(), `nanoclaw-cal-${Date.now()}.applescript`);
  writeFileSync(tmpFile, script, 'utf8');
  return new Promise((resolve, reject) => {
    execFile('osascript', [tmpFile], {
      timeout: 30_000,
    }, (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch {}
      if (stdout && stdout.trim()) {
        resolve(stdout.trim());
      } else if (err) {
        reject(new Error(`AppleScript error: ${stderr || err.message}`));
      } else {
        resolve('');
      }
    });
  });
}
