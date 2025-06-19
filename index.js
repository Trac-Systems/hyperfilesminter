import fs from 'fs';
import path from 'path';
import { getStorePath } from './src/functions.js';
import { App } from './src/app.js';
import FileExchangeProtocol from "./contract/FileExchangeProtocol.js";
import FileExchangeContract from "./contract/FileExchangeContract.js";
import Migration from "./features/migration/index.js";


export * from 'trac-peer/src/functions.js';

const RECEIPTS_DIR = path.join(Pear.config.dir, 'receipts'); 
if (!fs.existsSync(RECEIPTS_DIR)) { 
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
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
    bootstrap: 'a8067c9adccdf68a13294cb09db4710b279dab7401dd404255ef00febead4612',
    channel: '0000000000000000000000005fracpnk',
    store_name: getStorePath() + '/file-exchange-db',
    enable_logs: true,
    enable_txlogs: true,
    receipts_path: RECEIPTS_DIR
};

const old_path = getStorePath() + "/trac20_2";
const new_path = peer_opts.store_name;
if (false === fs.existsSync(new_path + '/db') && true === fs.existsSync(old_path + '/db/keypair.json')) {
    fs.mkdirSync(new_path, { recursive: true });
    fs.mkdirSync(new_path + '/db', { recursive: true });
    fs.copyFileSync(old_path + '/db/keypair.json', new_path + '/db/keypair.json');
    fs.rmSync(old_path, { recursive: true, force: true });
}

export const app = new App(msb_opts, peer_opts, [
    { name: 'migration', class: Migration }
]);

await app.start();

console.log("trac-peer node started successfully.");
console.log("Minter/Owner Address:", app.peer.wallet.publicKey);
console.log("\nNode is running in interactive mode.");
console.log("Type '/commands' to see available file exchange options.");
console.log("========================================================\n");


