import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const categories = ['Ingredientes o comida', 'Accesorios', 'Aseo', 'Mobiliario', 'Servilletas y empaques', 'Servicios públicos', 'Transporte', 'Arriendo', 'Nómina', 'Mantenimiento', 'Otros'];
const methods = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'];

async function main() {
  for (const [sortOrder, name] of categories.entries()) await db.category.upsert({ where: { name }, update: { sortOrder }, create: { name, sortOrder } });
  for (const [sortOrder, name] of methods.entries()) await db.paymentMethod.upsert({ where: { name }, update: { sortOrder }, create: { name, sortOrder } });
  for (const [key, value] of Object.entries({ businessName: 'Las Empanadas de Ángela', currency: 'COP', timezone: 'America/Bogota', country: 'Colombia' })) {
    await db.businessSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  console.log('Datos iniciales creados. Ejecuta npm run admin:create para crear el primer administrador.');
}

main().finally(() => db.$disconnect());
