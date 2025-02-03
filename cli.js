import readline from 'readline';
import log from './utils/logger.js';
import banner from './utils/banner.js';
import { readFiles, delay } from './utils/helper.js';
import LayerEdge from './utils/socket.js';
import fs from 'fs/promises';

const WALLETS_PATH = 'wallets.json';

async function readWallets() {
    try {
        await fs.access(WALLETS_PATH);
        const data = await fs.readFile(WALLETS_PATH, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.error("No wallets found in", WALLETS_PATH);
            return [];
        }
        throw err;
    }
}

async function showMenu() {
    console.log("\n=== LayerEdge CLI Menu ===");
    console.log("1. Start Node");
    console.log("2. Stop Node");
    console.log("3. Check Running Hours");
    console.log("4. Claim Daily Points");
    console.log("5. Check Tasks");
    console.log("6. View Referrals");
    console.log("7. Exit");
    console.log("========================\n");
}

async function calculateRunningHours(socket) {
    try {
        const response = await socket.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/light-node/node-status/${socket.wallet.address}`
        );

        if (response?.data?.data?.startTimestamp) {
            const startTime = response.data.data.startTimestamp;
            const currentTime = Math.floor(Date.now() / 1000);
            const runningSeconds = currentTime - startTime;
            const runningHours = (runningSeconds / 3600).toFixed(2);
            return runningHours;
        }
        return 0;
    } catch (error) {
        log.error("Error calculating running hours:", error.message);
        return 0;
    }
}

async function handleCommand(command, socket) {
    switch (command) {
        case "1":
            log.info("Starting node...");
            const startResult = await socket.setupWallet();
            if (startResult) {
                log.info("Node started successfully!");
                const hours = await calculateRunningHours(socket);
                log.info(`Current running time: ${hours} hours`);
            } else {
                log.error("Failed to start node");
            }
            break;

        case "2":
            log.info("Stopping node...");
            const stopResult = await socket.stopNode();
            if (stopResult) {
                log.info("Node stopped successfully!");
            } else {
                log.error("Failed to stop node");
            }
            break;

        case "3":
            const hours = await calculateRunningHours(socket);
            log.info(`Total node running time: ${hours} hours`);
            const { nodePoints } = await socket.checkNodePoints();
            log.info(`Total accumulated points: ${nodePoints}`);
            break;

        case "4":
            log.info("Claiming daily points...");
            const claimResult = await socket.api.claimDailyPoints();
            log.info("Claim result:", claimResult);
            break;

        case "5":
            log.info("Checking tasks...");
            const tasks = await socket.api.getTasks();
            log.info("Available tasks:", tasks);
            break;

        case "6":
            const referralInfo = await socket.api.getReferralCode();
            log.info("Your referral code:", referralInfo);
            break;

        case "7":
            log.info("Exiting...");
            process.exit(0);
            break;

        default:
            log.warn("Invalid command");
    }
}

async function main() {
    log.info(banner);
    await delay(1);

    const wallets = await readWallets();
    if (wallets.length === 0) {
        log.error("No wallets found. Please add wallets to wallets.json first");
        return;
    }

    const proxies = await readFiles('proxy.txt');
    let currentWalletIndex = 0;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    log.info(`Loaded ${wallets.length} wallets`);
    
    while (true) {
        const wallet = wallets[currentWalletIndex];
        const proxy = proxies[currentWalletIndex % proxies.length] || null;
        
        log.info(`\nCurrent wallet: ${wallet.address}`);
        if (proxy) log.info(`Using proxy: ${proxy}`);
        
        const socket = new LayerEdge(proxy, wallet.privateKey);
        
        await showMenu();

        const command = await new Promise(resolve => {
            rl.question("Enter command (1-7): ", resolve);
        });

        await handleCommand(command, socket);
        
        if (command === "7") break;

        // Ask if user wants to switch wallet
        const switchWallet = await new Promise(resolve => {
            rl.question("\nSwitch to next wallet? (y/n): ", resolve);
        });

        if (switchWallet.toLowerCase() === 'y') {
            currentWalletIndex = (currentWalletIndex + 1) % wallets.length;
        }
    }

    rl.close();
}

// Handle errors
process.on('unhandledRejection', (error) => {
    log.error('Unhandled promise rejection:', error);
});

main().catch(error => {
    log.error('Fatal error:', error);
    process.exit(1);
}); 
