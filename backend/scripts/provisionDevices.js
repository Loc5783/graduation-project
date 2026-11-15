import dotenv from 'dotenv';
import crypto from 'crypto';
import { open } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
dotenv.config({ path: envPath });
import { connectDB, disconnectDB } from '../src/config/db.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import { hashPairingSecret } from '../src/services/pairingSecret.js';

const catalog = [
  ['TRTM01', 'smart-bin'],
  ['KCTM01', 'smart-door-lock'],
  ['LOTM01', 'smart-speaker'],
  ['CBCC01', 'window-sensor'],
  ['OCTM01', 'smart-plug'],
  ['CBMT01', 'environment-sensor']
];

async function main() {
  if (process.argv[2] !== '--apply') throw new Error('Use --apply to provision the local development catalog.');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  await connectDB(uri);
  try {
    if (RegisteredDevice.db.name !== 'smart_home_privacy') throw new Error('This script is restricted to the local smart_home_privacy database.');
    const existing = await RegisteredDevice.find({ $or: [{ code: { $in: catalog.map(([code]) => code) } },
      { deviceId: { $in: catalog.map(([, id]) => id) } }] }).select('code deviceId').lean();
    if (existing.length) throw new Error('A catalog entry already exists; no codes were changed.');
    const rows = await Promise.all(catalog.map(async ([code, deviceId]) => {
      const secret = crypto.randomBytes(12).toString('base64url');
      return { code, deviceId, secret, claimSecretHash: await hashPairingSecret(secret) };
    }));
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../device-pairing-codes.local.txt');
    const handle = await open(filePath, 'wx', 0o600);
    try {
      await handle.writeFile('PRIVATE — do not commit. Print and attach the matching secret to each device.\n' +
        rows.map(({ code, deviceId, secret }) => `${deviceId}\t${code}\t${secret}`).join('\n') + '\n');
    } finally { await handle.close(); }
    await RegisteredDevice.insertMany(rows.map(({ code, deviceId, claimSecretHash }) => ({ code, deviceId, claimSecretHash })));
    console.log(`Provisioned ${rows.length} devices. Private pairing codes saved in ${filePath}.`);
  } finally { await disconnectDB(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
