// npm run hash-password: asks for a password at a hidden prompt and prints
// its hash, for FINANCE_LOGIN_HASH in the secrets file.
import { hashPassword } from './auth.ts';

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    if (!stdin.isTTY) {
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (d) => (buf += d));
      stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
      return;
    }
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.off('data', onData);
          stdin.pause();
          process.stderr.write('\n');
          resolve(buf);
          return;
        } else if (c === '\u0003') {
          process.exit(130);
        } else if (c === '\u007f') {
          buf = buf.slice(0, -1);
        } else {
          buf += c;
        }
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

const pw = await ask('New app password: ');
if (pw.length < 12) {
  process.stderr.write('Use at least 12 characters.\n');
  process.exit(1);
}
if (process.stdin.isTTY && (await ask('Again: ')) !== pw) {
  process.stderr.write('They do not match.\n');
  process.exit(1);
}
process.stdout.write(`${await hashPassword(pw)}\n`);
