#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkProcess(name) {
  return new Promise((resolve) => {
    exec(`pgrep -x "${name}"`, (error) => {
      resolve(!error);
    });
  });
}

async function startService(command, name, checkName = null) {
  const processName = checkName || name;
  const isRunning = await checkProcess(processName);

  if (isRunning) {
    log(`✅ ${name} est déjà démarré`, 'green');
    return;
  }

  log(`🚀 Démarrage de ${name}...`, 'cyan');

  return new Promise((resolve, reject) => {
    exec(command, (error) => {
      if (error && !error.message.includes('already')) {
        log(`❌ Erreur lors du démarrage de ${name}: ${error.message}`, 'red');
        reject(error);
      } else {
        log(`✅ ${name} démarré avec succès`, 'green');
        resolve();
      }
    });
  });
}

async function checkPrerequisites() {
  log('🔍 Vérification des prérequis...', 'blue');

  const tools = [
    { cmd: 'node --version', name: 'Node.js' },
    { cmd: 'npm --version', name: 'npm' },
  ];

  const optionalTools = [
    { cmd: 'redis-server --version', name: 'Redis' },
    { cmd: 'aria2c --version', name: 'aria2' },
    { cmd: 'yt-dlp --version', name: 'yt-dlp' },
    { cmd: 'ffmpeg -version', name: 'ffmpeg' },
  ];

  // Vérifier les outils requis
  for (const tool of tools) {
    try {
      await execAsync(tool.cmd);
      log(`✅ ${tool.name} installé`, 'green');
    } catch (error) {
      log(`❌ ${tool.name} non trouvé - Installation requise`, 'red');
      process.exit(1);
    }
  }

  // Vérifier les outils optionnels
  for (const tool of optionalTools) {
    try {
      await execAsync(tool.cmd);
      log(`✅ ${tool.name} installé`, 'green');
    } catch (error) {
      log(`⚠️  ${tool.name} non trouvé - Certaines fonctionnalités ne marcheront pas`, 'yellow');
    }
  }
}

async function startExternalServices() {
  log('\n🔧 Démarrage des services externes...', 'magenta');

  try {
    await startService('redis-server --daemonize yes', 'Redis', 'redis-server');
    await startService('aria2c --enable-rpc --rpc-listen-all=false --rpc-listen-port=6800 --rpc-secret=dev-secret --daemon', 'aria2', 'aria2c');
  } catch (error) {
    log('⚠️  Certains services externes n\'ont pas pu démarrer', 'yellow');
  }
}

function startDevelopmentServers() {
  log('\n🚀 Démarrage des serveurs de développement...', 'magenta');
  log('📝 Logs des serveurs:', 'blue');
  log('', 'reset');

  // Utiliser concurrently pour lancer les serveurs
  const concurrentlyCmd = 'npx concurrently --prefix="[{name}]" --names="backend,worker,frontend" --prefix-colors="green,yellow,blue" "cd backend && npm run dev" "cd backend && npm run worker" "cd frontend && npm run dev"';

  const child = spawn('sh', ['-c', concurrentlyCmd], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('close', (code) => {
    log(`\n🛑 Serveurs arrêtés (code: ${code})`, 'yellow');
  });

  // Gérer l'arrêt propre
  process.on('SIGINT', () => {
    log('\n🛑 Arrêt des serveurs...', 'yellow');
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    log('\n🛑 Arrêt des serveurs...', 'yellow');
    child.kill('SIGTERM');
  });
}

function showInstructions() {
  log('\n📋 Instructions:', 'blue');
  log('', 'reset');
  log('• Frontend: http://localhost:5173', 'cyan');
  log('• Backend API: http://localhost:3000', 'cyan');
  log('• Health check: http://localhost:3000/health', 'cyan');
  log('', 'reset');
  log('Appuyez sur Ctrl+C pour arrêter tous les serveurs', 'yellow');
  log('', 'reset');
}

async function main() {
  try {
    log('🎯 Advanced Download Manager - Démarrage', 'magenta');
    log('==========================================', 'magenta');

    await checkPrerequisites();
    await startExternalServices();

    showInstructions();

    startDevelopmentServers();

  } catch (error) {
    log(`❌ Erreur lors du démarrage: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();