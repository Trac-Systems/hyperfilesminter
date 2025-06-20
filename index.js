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
    bootstrap: '7863cfc321cd1374a5da1945677bd1e99a8623dca1247703a78d1e59ec0fc173',
    channel: '0000000000000000000000100fracpnk',
    store_name: getStorePath() + '/file-exchange-db',
    enable_logs: true,
    enable_txlogs: true,
    receipts_path: globalThis.RECEIPTS_DIR || RECEIPTS_DIR
};

const old_path = getStorePath() + "/trac20_2";
const new_path = peer_opts.store_name;

try {
    const newDbPath = new_path + '/db';
    const oldKeypairPath = old_path + '/db/keypair.json';
    const newKeypairPath = newDbPath + '/keypair.json';
    
    const needsMigration = !fs.existsSync(newDbPath) && fs.existsSync(oldKeypairPath);
    
    if (needsMigration) {
        console.log('Starting database migration...');
        
        
        if (!fs.existsSync(new_path)) {
            fs.mkdirSync(new_path, { recursive: true });
            if (process.platform === 'linux' || process.platform === 'darwin') {
                fs.chmodSync(new_path, 0o755);
            }
        }
        
        if (!fs.existsSync(newDbPath)) {
            fs.mkdirSync(newDbPath, { recursive: true });
            if (process.platform === 'linux' || process.platform === 'darwin') {
                fs.chmodSync(newDbPath, 0o755);
            }
        }
        
        fs.copyFileSync(oldKeypairPath, newKeypairPath);
        
        
        if (process.platform === 'linux' || process.platform === 'darwin') {
            try {
                fs.chmodSync(newKeypairPath, 0o600); 
            } catch (chmodError) {
                console.warn('Could not set keypair permissions:', chmodError.message);
            }
        }
        
        try {
            fs.rmSync(old_path, { recursive: true, force: true });
            console.log('Database migration completed successfully.');
        } catch (rmError) {
            console.warn('Could not remove old directory:', rmError.message);
            console.warn('You may want to manually remove:', old_path);
        }
    }
} catch (migrationError) {
    console.error('Error during database migration:', migrationError.message);
    console.error('Continuing with application startup...');
    
    try {
        const newDbPath = new_path + '/db';
        if (!fs.existsSync(newDbPath)) {
            fs.mkdirSync(newDbPath, { recursive: true });
            if (process.platform === 'linux' || process.platform === 'darwin') {
                fs.chmodSync(newDbPath, 0o755);
            }
        }
    } catch (dirError) {
        console.error('Critical error: Could not create database directory:', dirError.message);
        process.exit(1);
    }
}

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
