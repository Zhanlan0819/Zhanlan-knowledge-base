import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const out = path.resolve(arg('--out') ?? 'review-keys');
fs.mkdirSync(out, { recursive: true });
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubPath = path.join(out, 'review-public.pem');
const privPath = path.join(out, 'review-private.pem');
fs.writeFileSync(pubPath, pub, { flag: 'wx', mode: 0o644 });
fs.writeFileSync(privPath, priv, { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ public_key: pubPath, private_key: privPath }, null, 2) + '\n');
