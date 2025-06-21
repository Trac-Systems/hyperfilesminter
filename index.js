import fs from 'fs';
import path from 'path';
import os from 'os';
import { getStorePath } from './src/functions.js';
import { App } from './src/app.js';
import FileExchangeProtocol from "./contract/FileExchangeProtocol.js";
import FileExchangeContract from "./contract/FileExchangeContract.js";

import Migration from "./features/migration/index.js";

export * from 'trac-peer/src/functions.js';

function getSafePearConfigDir() {
    if (typeof Pear !== 'undefined' && Pear.config && Pear.config.dir) {
        return Pear.config.dir;
    }
    const storePath = getStorePath();
    return storePath;
}

const RECEIPTS_DIR = path.join(getSafePearConfigDir(), 'receipts');

try {
    if (!fs.existsSync(RECEIPTS_DIR)) {
        fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
        if (process.platform === 'linux' || process.platform === 'darwin') {
            try {
                fs.chmodSync(RECEIPTS_DIR, 0o755);
            } catch (chmodError) {
                console.warn('Could not set directory permissions:', chmodError.message);
            }
        }
    }
} catch (error) {
    console.error('Error creating receipts directory:', error.message);
    console.error('Attempting to create in alternative location...');

    const fallbackReceiptsDir = path.join(os.homedir(), '.hypertokens-cli', 'receipts');
    try {
        fs.mkdirSync(fallbackReceiptsDir, { recursive: true });
        console.log('Created receipts directory in:', fallbackReceiptsDir);

        Object.defineProperty(globalThis, 'RECEIPTS_DIR', {
            value: fallbackReceiptsDir,
            writable: false
        });
    } catch (fallbackError) {
        console.error('Failed to create fallback receipts directory:', fallbackError.message);
        process.exit(1);
    }
}

console.log('Storage path:', getStorePath());
console.log('Receipts path:', RECEIPTS_DIR);

const msb_opts = {
    bootstrap: '54c2623aa400b769b2837873653014587278fb83fd72e255428f78a4ff7bac87',
    channel: '00000000000000000000000trac20msb',
    store_name: getStorePath() + '/t20msb_2'
};

const peer_opts = {
    protocol: FileExchangeProtocol,
    contract: FileExchangeContract,
    bootstrap: '36fe3fd83c25cbc9759b3f191c8825f9028f1d57fc01c825a9868e3b11f929f0',
    channel: '0000000000000000000000101fracpnk',
    store_name: getStorePath() + '/file-exchange-db', // Este es el destino final de la keypair
    enable_logs: true,
    enable_txlogs: true,
    receipts_path: globalThis.RECEIPTS_DIR || RECEIPTS_DIR
};

const old_path_v1 = getStorePath() + "/trac20";
const new_path_v1 = peer_opts.store_name;
if (false === fs.existsSync(new_path_v1 + '/db') &&
    true === fs.existsSync(old_path_v1 + '/db/keypair.json')) {
    fs.mkdirSync(new_path_v1, { recursive: true }); // Asegura que el directorio destino exista
    fs.mkdirSync(new_path_v1 + '/db', { recursive: true }); // Asegura que el directorio /db destino exista
    fs.copyFileSync(old_path_v1 + '/db/keypair.json', new_path_v1 + '/db/keypair.json');
    fs.rmSync(old_path_v1, { recursive: true, force: true });
    console.log(`Migrated keypair from ${old_path_v1} to ${new_path_v1}`);
}

const old_path_v2 = getStorePath() + "/trac20_2";
const new_path_v2 = peer_opts.store_name;
if (false === fs.existsSync(new_path_v2 + '/db') &&
    true === fs.existsSync(old_path_v2 + '/db/keypair.json')) {
    fs.mkdirSync(new_path_v2, { recursive: true }); // Asegura que el directorio destino exista
    fs.mkdirSync(new_path_v2 + '/db', { recursive: true }); // Asegura que el directorio /db destino exista
    fs.copyFileSync(old_path_v2 + '/db/keypair.json', new_path_v2 + '/db/keypair.json');
    fs.rmSync(old_path_v2, { recursive: true, force: true });
    console.log(`Migrated keypair from ${old_path_v2} to ${new_path_v2}`);
}

// =================================================================

export const app = new App(msb_opts, peer_opts, [
    { name: 'migration', class: Migration }
]);

try {
    await app.start();

    console.log("trac-peer node started successfully.");
    console.log("Minter/Owner Address:", app.peer.wallet.publicKey);
    console.log("\nNode is running in interactive mode.");
    console.log("Type '/commands' to see available file exchange options.");
    console.log("========================================================\n");

} catch (startError) {
    console.error('Error starting application:', startError.message);
    console.error('Stack trace:', startError.stack);

    if (process.platform === 'linux') {
        console.error('\nLinux diagnostic information:');
        console.error('- Current user:', os.userInfo().username);
        console.error('- Home directory:', os.homedir());
        console.error('- Storage path exists:', fs.existsSync(getStorePath()));
        console.error('- Receipts path exists:', fs.existsSync(globalThis.RECEIPTS_DIR || RECEIPTS_DIR));
        console.error('- Node.js version:', process.version);
        console.error('- Platform:', process.platform);
        console.error('- Architecture:', process.arch);
    }
    process.exit(1);
}