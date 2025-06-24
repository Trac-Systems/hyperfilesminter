import {getStorePath} from './src/functions.js';
import {App} from './src/app.js';
export * from 'trac-peer/src/functions.js'
import FileExchangeProtocol from "./contract/FileExchangeProtocol.js";
import FileExchangeContract from "./contract/FileExchangeContract.js";
import {Timer} from "./features/timer/index.js";

console.log('Storage path:', getStorePath());


const msb_opts = {};
msb_opts.bootstrap = '54c2623aa400b769b2837873653014587278fb83fd72e255428f78a4ff7bac87';
msb_opts.channel = '00000000000000000000000trac20msb';
msb_opts.store_name = getStorePath() + '/t20msb_2';


const peer_opts = {};
peer_opts.protocol = FileExchangeProtocol;
peer_opts.contract = FileExchangeContract;
peer_opts.bootstrap = '0c2ece0c5e17fb8dc2bb53c5850d46a4d7b3eae170e4bd53c0c7d676e1194163';
peer_opts.channel = '0000000000000000000000104fracpnk';
peer_opts.store_name = getStorePath() + '/file-exchange-db';
peer_opts.api_tx_exposed = true;
peer_opts.api_msg_exposed = true;


const timer_opts = {};
timer_opts.update_interval = 60_000;

export const app = new App(msb_opts, peer_opts, [
    {
        name : 'timer',
        class : Timer,
        opts : timer_opts
    }
]);
await app.start();
