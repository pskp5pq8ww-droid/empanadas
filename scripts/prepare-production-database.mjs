import { spawnSync } from 'node:child_process';
import process from 'node:process';

const shouldPrepareDatabase = process.env.DEPLOY_DATABASE === 'true';

if (!shouldPrepareDatabase) {
  process.stdout.write('Preparacion de base de datos omitida (DEPLOY_DATABASE no esta habilitado).\n');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL es obligatoria cuando DEPLOY_DATABASE=true.');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpmScript(script) {
  const result = spawnSync(npmCommand, ['run', script], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`El comando npm run ${script} termino con codigo ${result.status ?? 'desconocido'}.`);
  }
}

runNpmScript('db:deploy');
runNpmScript('db:seed');
