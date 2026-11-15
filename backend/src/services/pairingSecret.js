import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

export async function hashPairingSecret(secret, salt = crypto.randomBytes(16)) {
  const key = await scrypt(secret, salt, 32);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPairingSecret(secret, stored) {
  if (typeof secret !== 'string' || typeof stored !== 'string' || secret.length > 128) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!/^[0-9a-f]{32}$/.test(saltHex || '') || !/^[0-9a-f]{64}$/.test(hashHex || '')) return false;
  const actual = await scrypt(secret, Buffer.from(saltHex, 'hex'), 32);
  return crypto.timingSafeEqual(actual, Buffer.from(hashHex, 'hex'));
}
