import axios from "axios";
import chalk from "chalk";
import { Wallet } from "ethers";
import log from "./logger.js";
import { newAgent } from "./helper.js";

class LayerEdgeConnection {
    constructor(proxy = null, privateKey = null, refCode = "O8Ijyqih") {
        this.refCode = refCode;
        this.proxy = proxy;
        this.headers = {
            Accept: "application/json, text/plain, */*",
            Origin: "https://dashboard.layeredge.io",
        }

        this.axiosConfig = {
            ...(this.proxy && { httpsAgent: newAgent(this.proxy) }),
            timeout: 60000,
        };

        this.wallet = privateKey
            ? new Wallet(privateKey)
            : Wallet.createRandom();

        this.maxRetries = 5;
        this.retryDelay = 3000;
    }

    getWallet() {
        return this.wallet;
    }

    async makeRequest(method, url, config = {}, retries = 30) {
        let lastError = null;
        
        for (let i = 0; i < retries; i++) {
            try {
                const headers = { 
                    ...this.headers,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                };
                
                if (method.toUpperCase() === 'POST') {
                    headers['Content-Type'] = 'application/json';
                }

                const response = await axios({
                    method,
                    url,
                    headers,
                    ...this.axiosConfig,
                    ...config,
                });

                await new Promise(resolve => setTimeout(resolve, 1000));
                
                return response;
            } catch (error) {
                lastError = error;
                
                if (error?.response?.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }

                if (error?.response?.status === 404 || error?.status === 404) {
                    log.error(chalk.red(`Layer Edge connection failed wallet not registered yet...`));
                    return 404;
                } else if (error?.response?.status === 405 || error?.status === 405) {
                    return { data: 'Already CheckIn today' };
                } else if (i === retries - 1) {
                    log.error(`Max retries reached - Request failed:`, error.message);
                    if (this.proxy) {
                        log.error(`Failed proxy: ${this.proxy}`, error.message);
                    }
                    return null;
                }

                process.stdout.write(chalk.yellow(`request failed: ${error.message} => Retrying... (${i + 1}/${retries})\r`));
                const delay = this.retryDelay * (i + 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }

    async checkInvite(invite_code) {
        const inviteData = {
            invite_code,
        };

        const response = await this.makeRequest(
            "post",
            "https://referralapi.layeredge.io/api/referral/verify-referral-code",
            { data: inviteData }
        );

        if (response && response.data && response.data.data.valid === true) {
            log.info("Invite Code Valid", response.data);
            return true;
        } else {
            log.error("Failed to check invite",);
            return false;
        }
    }

    async registerWallet(invite_code) {
        const registerData = {
            walletAddress: this.wallet.address,
        };

        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/referral/register-wallet/${invite_code}`,
            { data: registerData }
        );

        if (response && response.data) {
            log.info("Wallet successfully registered", response.data);
            return true;
        } else {
            log.error("Failed To Register wallets", "error");
            return false;
        }
    }

    async connectNode() {
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                const timestamp = Date.now();
                const message = `Node activation request for ${this.wallet.address} at ${timestamp}`;
                const sign = await this.wallet.signMessage(message);

                const dataSign = {
                    sign: sign,
                    timestamp: timestamp,
                };

                const response = await this.makeRequest(
                    "post",
                    `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/start`,
                    { data: dataSign }
                );

                if (response?.data?.message === "node action executed successfully") {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const isRunning = await this.checkNodeStatus();
                    
                    if (isRunning) {
                        log.info("Node connected and verified running");
                        return true;
                    }
                }
                
                log.warn(`Connect attempt ${i + 1} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                
            } catch (error) {
                log.error(`Connect attempt ${i + 1} failed:`, error.message);
                if (i === this.maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
        return false;
    }

    async stopNode() {
        const timestamp = Date.now();
        const message = `Node deactivation request for ${this.wallet.address} at ${timestamp}`;
        const sign = await this.wallet.signMessage(message);

        const dataSign = {
            sign: sign,
            timestamp: timestamp,
        };

        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/stop`,
            { data: dataSign }
        );

        if (response && response.data) {
            log.info("Stop and Claim Points Result:", response.data);
            return true;
        } else {
            log.error("Failed to Stopping Node and claiming points");
            return false;
        }
    }

    async checkIN() {
        const timestamp = Date.now();
        const message = `I am claiming my daily node point for ${this.wallet.address} at ${timestamp}`;
        const sign = await this.wallet.signMessage(message);

        const dataSign = {
            sign: sign,
            timestamp: timestamp,
            walletAddress: this.wallet.address
        };

        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/claim-node-points`,
            { data: dataSign }
        );

        if (response && response.data) {
            log.info("Daily Check in Result:", response.data);
            return true;
        } else {
            log.error("Failed to perform check in...");
            return false;
        }
    }

    async checkNodeStatus() {
        const response = await this.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/light-node/node-status/${this.wallet.address}`
        );

        if (response === 404) {
            log.info("Node not found in this wallet, trying to regitering wallet...");
            await this.registerWallet();
            return false;
        }

        if (response && response.data && response.data.data.startTimestamp !== null) {
            log.info("Node Status Running", response.data);
            return true;
        } else {
            log.error("Node not running trying to start node...");
            return false;
        }
    }

    async checkNodePoints() {
        const response = await this.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
        );

        if (response?.data?.data) {
            const refCode = response.data.data.referralCode || null;
            const referralCount = response.data?.data?.referrals?.length || 0;
            const nodePoints = response.data.data.nodePoints ?? 0;

            log.info(`${this.wallet.address} Total Points:`, nodePoints);
            return { refCode, nodePoints, referralCount };
        } else {
            log.error("Failed to check Total Points..");
            return { refCode: null, nodePoints: 0, referralCount: 0 };
        }
    }

    async checkNodeHealth() {
        try {
            const response = await this.makeRequest(
                "get", 
                `https://referralapi.layeredge.io/api/light-node/health/${this.wallet.address}`
            );
            
            return response?.data?.status === "healthy";
        } catch (error) {
            log.error("Failed to check node health:", error.message);
            return false;
        }
    }
}

export default LayerEdgeConnection;
