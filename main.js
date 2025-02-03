import fs from 'fs/promises'
import log from './utils/logger.js'
import { readFiles, delay } from './utils/helper.js'
import banner from './utils/banner.js';
import LayerEdge from './utils/socket.js';

const WALLETS_PATH = 'wallets.json'  // change to walletsRef.json if you want to running ref wallets

// Function to read wallets 
async function readWallets() {
    try {
        await fs.access(WALLETS_PATH);

        const data = await fs.readFile(WALLETS_PATH, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info("No wallets found in", WALLETS_PATH);
            return [];
        }
        throw err;
    }
}

async function run() {
    log.info(banner);
    await delay(3);

    const proxies = await readFiles('proxy.txt');
    let wallets = await readWallets();
    
    // Add configuration
    const config = {
        checkInterval: 60 * 60, // 1 hour
        minPointsBeforeClaim: 50, // Min points before claiming
        maxRetries: 3,
        healthCheckInterval: 5 * 60, // 5 minutes
    };

    if (proxies.length === 0) log.warn("No proxies found in proxy.txt - running without proxies");
    if (wallets.length === 0) {
        log.info('No Wallets found, creating new Wallets first "npm run autoref"');
        return;
    }

    log.info('Starting run Program with all Wallets:', wallets.length);

    // Add health check interval
    setInterval(async () => {
        for (const wallet of wallets) {
            const socket = new LayerEdge(null, wallet.privateKey);
            const health = await socket.checkNodeHealth();
            if (!health) {
                log.warn(`Node ${wallet.address} appears unhealthy, attempting reconnect...`);
                await socket.connectNode();
            }
        }
    }, config.healthCheckInterval * 1000);

    while (true) {
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const proxy = proxies[i % proxies.length] || null;
            const { address, privateKey } = wallet;

            for (let retry = 0; retry < config.maxRetries; retry++) {
                try {
                    const socket = new LayerEdge(proxy, privateKey);
                    log.info(`Processing Wallet Address: ${address} with proxy:`, proxy);
                    
                    // Check points first
                    const { nodePoints } = await socket.checkNodePoints();
                    
                    if (nodePoints >= config.minPointsBeforeClaim) {
                        log.info(`Sufficient points (${nodePoints}) for claiming...`);
                        await socket.checkIN();
                        await socket.stopNode();
                        await delay(5); // Wait 5 seconds
                    }

                    const isRunning = await socket.checkNodeStatus();
                    if (!isRunning) {
                        log.info(`Connecting node for Wallet: ${address}`);
                        await socket.connectNode();
                    }

                    break; // Success - exit retry loop
                    
                } catch (error) {
                    log.error(`Error Processing wallet (attempt ${retry + 1}/${config.maxRetries}):`, error.message);
                    if (retry === config.maxRetries - 1) {
                        log.error(`Failed all retries for wallet ${address}`);
                    }
                    await delay(10); // Wait between retries
                }
            }
        }
        
        log.warn(`All Wallets processed, waiting ${config.checkInterval/60} minutes before next run...`);
        await delay(config.checkInterval);
    }
}

// Add graceful shutdown
process.on('SIGINT', async () => {
    log.info('Shutting down gracefully...');
    // Add cleanup code here if needed
    process.exit(0);
});

run().catch(error => {
    log.error('Fatal error:', error);
    process.exit(1);
});
