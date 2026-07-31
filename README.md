# Administración — Las Empanadas de Ángela

Aplicación web empresarial para manejar gastos, ingresos, pagos, recurrencias, nómina, agenda, reportes, colaboradores y auditoría. Incluye dos portales protegidos: administrador y colaborador. Toda la interfaz está en español, usa COP y presenta fechas para Colombia.

## Qué incluye

- Acceso por usuario y PIN de cuatro dígitos, cifrado con Argon2id.
- Sesiones persistentes con cookie `httpOnly`, `sameSite=lax`, vencimiento de 8 horas y `secure` en producción.
- Protección por roles en el servidor, CSRF, Helmet, límites de peticiones y bloqueo de acceso tras 5 intentos fallidos en 15 minutos por usuario e IP.
- Portal móvil del colaborador para registrar gastos y ver exclusivamente sus envíos.
- Dashboard administrativo con indicadores reales, tendencia de ingresos/gastos, vencimientos y movimientos recientes.
- Gastos auditables con estados Registrado, Verificado y Anulado, más claves de idempotencia.
- Ingresos, cuentas por pagar, pagos recurrentes, empleados, nómina y agenda.
- Creación automática e idempotente de un gasto al pagar una cuenta o nómina.
- CSV de gastos compatible con Excel (UTF-8 con BOM) y vista limpia de impresión.
- PWA instalable básica. El service worker no intercepta peticiones ni guarda movimientos fuera de línea.
- Migración MySQL versionada, datos iniciales, creación segura del primer administrador y GitHub Actions.

## Arquitectura

```text
client/             React, React Router, TanStack Query y Recharts
server/             API REST Express, sesiones, seguridad y tareas recurrentes
shared/             Validación y aritmética de dinero reutilizable
prisma/             Esquema, migración MySQL y seed
public/             Logo, iconos y manifiesto PWA
scripts/            Creación segura del primer administrador
.github/workflows/  Verificación automática
dist/               Salida generada; no se sube al repositorio
```

Express sirve `dist/public` en producción, por lo que solo hace falta un proceso Node.js. Prisma usa `DECIMAL(14,2)` para dinero y los timestamps se guardan en UTC. El navegador muestra las fechas con la configuración colombiana; la zona inicial es `America/Bogota`.

## Requisitos locales

- Node.js 22 LTS (mínimo 22.12, menor que 23).
- npm 10 o superior.
- MySQL 8 o MariaDB compatible con las funciones usadas por Prisma.
- Una base vacía y un usuario con permisos para crear tablas e índices.

## Instalación local

1. Entra al proyecto e instala las dependencias:

   ```bash
   cd "/Users/laikito/Documents/Empanadas de Angela"
   npm ci
   ```

2. Crea la base de datos. En MySQL, ajusta usuario y contraseña:

   ```sql
   CREATE DATABASE empanadas_angela CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'empanadas_app'@'localhost' IDENTIFIED BY 'UNA_CLAVE_SEGURA';
   GRANT ALL PRIVILEGES ON empanadas_angela.* TO 'empanadas_app'@'localhost';
   FLUSH PRIVILEGES;
   ```

3. Copia la plantilla y completa sus valores:

   ```bash
   cp .env.example .env
   ```

   Genera secretos diferentes con:

   ```bash
   openssl rand -base64 48
   ```

4. Genera Prisma, aplica la migración y carga catálogos iniciales:

   ```bash
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   ```

5. Crea el primer administrador. Escribe temporalmente en `.env` un `ADMIN_PIN` de cuatro dígitos, ejecuta el comando y luego elimina ese valor de `.env`:

   ```bash
   npm run admin:create
   ```

6. Inicia frontend y API en desarrollo:

   ```bash
   npm run dev
   ```

   Abre `http://localhost:5173`. Vite envía `/api` al puerto 3000.

## Variables de entorno

| Variable | Uso |
|---|---|
| `NODE_ENV` | `development`, `test` o `production` |
| `PORT` | Puerto interno entregado al proceso Node; usa `3000` localmente |
| `DATABASE_URL` | Conexión MySQL de Prisma |
| `SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `CRON_SECRET` | Secreto distinto para el endpoint de recurrencias |
| `APP_URL` | Origen público exacto, con HTTPS en producción |
| `TZ` | `America/Bogota` |
| `ADMIN_USERNAME`, `ADMIN_NAME`, `ADMIN_PIN` | Solo para `npm run admin:create`; borra el PIN después |

No subas `.env`. Está excluido por `.gitignore`.

## Comandos

```bash
npm run dev          # frontend y API con recarga
npm run lint         # ESLint
npm run typecheck    # TypeScript cliente y servidor
npm test             # pruebas unitarias y de integración HTTP
npm run build        # Prisma + Vite + servidor TypeScript
npm start            # dist/server/index.js
npm run db:migrate   # crea/aplica migraciones durante desarrollo
npm run db:deploy    # aplica migraciones existentes en producción
npm run db:seed      # categorías, métodos y datos básicos
npm run admin:create # crea o actualiza el primer administrador
```

Antes de subir un cambio ejecuta:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Subir a GitHub

El repositorio ya existe localmente. Revisa primero el alcance exacto:

```bash
git status -sb
git diff -- . ':!package-lock.json'
git diff --stat
```

Después crea un repositorio vacío en GitHub, sin README ni licencia, y publica únicamente los archivos revisados:

```bash
git add .env.example .gitignore .github README.md package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts eslint.config.js client server shared prisma public scripts
git status -sb
git commit -m "feat: crear centro administrativo"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

Si `origin` ya existe, compruébalo con `git remote -v` y no vuelvas a agregarlo.

## Despliegue en Hostinger

Hostinger permite importar un repositorio de GitHub para una aplicación Node.js y configurar la versión de Node, las variables y los comandos desde el entorno de la aplicación. Como los nombres del panel pueden cambiar, busca los campos equivalentes a estos valores:

1. Crea o selecciona una **aplicación web Node.js** y conecta el repositorio de GitHub.
2. Selecciona Node.js 22 LTS. El campo `engines` de `package.json` también lo declara.
3. Usa instalación `npm ci`.
4. Usa compilación `npm run build`.
5. Usa inicio `npm start`. Si el panel pide un archivo de entrada, indica `dist/server/index.js`.
6. Configura todas las variables de `.env.example` en el panel, con `NODE_ENV=production`, `APP_URL=https://tu-dominio.com` y secretos nuevos.
7. Crea la base MySQL desde el panel de hosting y copia su host, puerto, nombre, usuario y contraseña a `DATABASE_URL`. Codifica caracteres especiales de usuario o contraseña como URL.
8. En la consola de despliegue ejecuta una vez:

   ```bash
   npm run db:deploy
   npm run db:seed
   ADMIN_USERNAME=admin ADMIN_NAME="Administrador" ADMIN_PIN='<PIN_DE_4_DIGITOS>' npm run admin:create
   ```

   Sustituye el marcador por un PIN nuevo, ejecuta el comando y elimina `ADMIN_PIN` del entorno inmediatamente.
9. Conecta el dominio, activa HTTPS y confirma que `https://tu-dominio.com/api/health` responde con `status: ok`.
10. Revisa los registros del build y del proceso si el despliegue no inicia.

Guía oficial de referencia: [desplegar una aplicación Node.js en Hostinger](https://www.hostinger.com/tutorials/deploy-node-js-application).

### Cron de pagos recurrentes

La aplicación genera ocurrencias cuando un administrador abre el dashboard o la agenda. Para no depender de visitas, configura también un cron diario como tipo **Custom** con el equivalente a:

```bash
curl --fail --silent --show-error --request POST --header "Authorization: Bearer TU_CRON_SECRET" "https://tu-dominio.com/api/cron/recurring"
```

Programa una ejecución diaria, por ejemplo a las 06:00 en la zona del servidor. Usa exactamente el mismo `CRON_SECRET` configurado en la aplicación. Prueba el comando primero desde terminal y revisa la salida del cron. Hostinger documenta la creación de [tareas cron personalizadas](https://www.hostinger.com/support/1583465-how-to-set-up-a-cron-job-at-hostinger/) y la [consulta de su salida](https://www.hostinger.com/support/5647075-how-to-check-the-output-of-a-cron-job-at-hostinger/).

## Copia y restauración de MySQL

Haz una copia antes de cada migración o despliegue relevante:

```bash
mysqldump --single-transaction --routines --triggers --host=HOST --user=USUARIO --password BASE_DE_DATOS > empanadas_$(date +%Y%m%d_%H%M).sql
```

Guarda la copia cifrada fuera del servidor. Para restaurar en una base vacía:

```bash
mysql --host=HOST --user=USUARIO --password BASE_DE_DATOS < copia.sql
npm run db:deploy
```

Verifica después `/api/health`, el dashboard y un listado. No pruebes una restauración directamente sobre producción: usa primero una base temporal.

## Seguridad y operación

- Nunca compartas PIN, cookies, `DATABASE_URL`, `SESSION_SECRET` ni `CRON_SECRET`.
- La ruta `/api/health` prueba la base sin revelar detalles de conexión.
- Los registros anulados no se borran y no participan en totales.
- Las ediciones sensibles generan `AuditLog` con usuario, acción, entidad y valores anteriores/nuevos.
- Las restricciones únicas `Expense.payableId`, `Expense.payrollId`, `Expense.idempotencyKey` y `(ruleId, dueDate)` evitan duplicados.
- Cambia los PIN desde Configuración si alguien pierde acceso; no intentes leerlos de la base porque solo existe el hash.

## Diagnóstico

- **La aplicación no inicia:** confirma Node 22, `npm run build`, el archivo `dist/server/index.js` y que `PORT` no esté bloqueado.
- **Prisma `P1001`:** MySQL no es accesible; revisa host, puerto, lista de IP permitidas y credenciales.
- **Prisma `P2021`:** faltan tablas; ejecuta `npm run db:deploy`.
- **La sesión no se conserva:** confirma HTTPS, `APP_URL` exacta y que el proxy entregue `X-Forwarded-Proto`.
- **403 de seguridad:** recarga la aplicación para renovar el token CSRF.
- **El cron responde 401:** el encabezado Bearer no coincide con `CRON_SECRET`.
- **El build se queda sin memoria:** revisa límites del plan y los registros del despliegue.

## Pruebas

Las pruebas cubren aritmética decimal y COP, acceso correcto/incorrecto, bloqueo, permisos, aislamiento por colaborador, idempotencia de gastos y recurrencias, exclusión de anulados, creación única del gasto al pagar cuenta/nómina y cálculo principal del dashboard. Las pruebas HTTP usan una base Prisma simulada; para una verificación previa a producción, despliega sobre una base MySQL temporal, aplica migraciones y recorre el flujo acceso → gasto → dashboard.

No se incluye PDF en la primera versión: CSV e impresión cubren la exportación sin añadir un motor pesado de renderizado al servidor.
