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

    const config = {
        checkInterval: 60 * 60,
        minPointsBeforeClaim: 100,
        maxRetries: 3,
        healthCheckInterval: 5 * 60,
        setupRetryDelay: 10, // seconds
    };

    const proxies = await readFiles('proxy.txt');
    let wallets = await readWallets();

    if (wallets.length === 0) {
        log.error('No wallets found. Please run "npm run autoref" first');
        return;
    }

    log.info('Starting program with', wallets.length, 'wallets');

    // Health check monitoring
    const healthCheck = setInterval(async () => {
        for (const wallet of wallets) {
            try {
                const socket = new LayerEdge(null, wallet.privateKey);
                const health = await socket.checkNodeHealth();
                if (!health) {
                    log.warn(`Node ${wallet.address} unhealthy - attempting recovery...`);
                    await socket.setupWallet();
                }
            } catch (error) {
                log.error(`Health check failed for ${wallet.address}:`, error.message);
            }
        }
    }, config.healthCheckInterval * 1000);

    // Graceful shutdown handler
    const cleanup = async () => {
        clearInterval(healthCheck);
        log.info('Shutting down...');
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        while (true) {
            for (const wallet of wallets) {
                const proxy = proxies[Math.floor(Math.random() * proxies.length)] || null;
                
                for (let retry = 0; retry < config.maxRetries; retry++) {
                    try {
                        const socket = new LayerEdge(proxy, wallet.privateKey);
                        log.info(`Processing ${wallet.address} with proxy:`, proxy || 'none');

                        await socket.setupWallet();
                        break;

                    } catch (error) {
                        log.error(`Error processing ${wallet.address} (attempt ${retry + 1}/${config.maxRetries}):`, error.message);
                        if (retry === config.maxRetries - 1) {
                            log.error(`Failed all retries for ${wallet.address}`);
                        }
                        await delay(config.setupRetryDelay);
                    }
                }
            }

            log.info(`Cycle complete. Waiting ${config.checkInterval/60} minutes...`);
            await delay(config.checkInterval);
        }
    } catch (error) {
        log.error('Fatal error:', error);
        cleanup();
    }
}

run().catch(error => {
    log.error('Program crashed:', error);
    process.exit(1);
});
