import {getStorePath} from './src/functions.js';
import {App} from './src/app.js';
export * from 'trac-peer/src/functions.js'
import FileExchangeProtocol from "./contract/FileExchangeProtocol.js";
import FileExchangeContract from "./contract/FileExchangeContract.js";
import {Timer} from "./features/timer/index.js";

console.log('Storage path:', getStorePath());

///// MSB SETUP
// To run this example, you don't need to create your own MSB
// Instead go with the options as-is. The below bootstrap is an MSB testnet (gasless).
const msb_opts = {};
msb_opts.bootstrap = '54c2623aa400b769b2837873653014587278fb83fd72e255428f78a4ff7bac87';
msb_opts.channel = '00000000000000000000000trac20msb';
msb_opts.store_name = getStorePath() + '/t20msb_2';

///// SAMPLE CONTRACT SETUP
// The sample contract needs to be deployed first.
// See the README.md for further information.
const peer_opts = {};
peer_opts.protocol = FileExchangeProtocol;
peer_opts.contract = FileExchangeContract;
peer_opts.bootstrap = 'ffe10be9eab3f91bfb1635862e6f7f4760be97fb375fa7f525ef1d49c8379e8e';
peer_opts.channel = '0000000000000000000000102fracpnk';
peer_opts.store_name = getStorePath() + '/file-exchange-db';
peer_opts.api_tx_exposed = true;
peer_opts.api_msg_exposed = true;

///// FEATURES
// Pass multiple features (aka oracles) to the peer and inject data into
// your contract. Can also go the other way, depending on how you need it.
// You may add as many Features as you wish.
// In /src/app.js, the Features are being executed by the admin (usually the Peer Bootstrap)
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
