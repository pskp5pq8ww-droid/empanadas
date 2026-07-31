import 'dotenv/config';
import argon2 from 'argon2';
import { db } from '../server/db.js';

const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim();
const pin = process.env.ADMIN_PIN;
if (!username || !name || !/^\d{4}$/.test(pin ?? '')) {
  console.error('Configura ADMIN_USERNAME, ADMIN_NAME y ADMIN_PIN (exactamente 4 dígitos) solo para ejecutar este comando.');
  process.exit(1);
}
const pinHash = await argon2.hash(pin!, { type: argon2.argon2id, memoryCost: 19456, timeCost: 3, parallelism: 1 });
await db.user.upsert({ where: { username }, update: { name, pinHash, role: 'ADMIN', active: true }, create: { username, name, pinHash, role: 'ADMIN' } });
console.log(`Administrador ${username} creado o actualizado correctamente.`);
await db.$disconnect();
