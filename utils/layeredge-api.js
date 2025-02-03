import axios from 'axios';
import { ethers } from 'ethers';
import log from './logger.js';

class LayerEdgeAPI {
    constructor(privateKey = null) {
        this.baseURL = 'https://referralapi.layeredge.io/api';
        this.dashboardURL = 'https://dashboard.layeredge.io';
        this.wallet = privateKey ? new ethers.Wallet(privateKey) : null;
        
        this.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': this.dashboardURL,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': this.dashboardURL
        };
    }

    async signMessage(message) {
        if (!this.wallet) throw new Error('Wallet not initialized');
        return await this.wallet.signMessage(message);
    }

    // Node Management
    async startNode() {
        try {
            const timestamp = Date.now();
            const message = `Node activation request for ${this.wallet.address} at ${timestamp}`;
            const signature = await this.signMessage(message);

            const response = await axios.post(`${this.baseURL}/light-node/node-action/${this.wallet.address}/start`, {
                sign: signature,
                timestamp: timestamp
            }, { headers: this.headers });

            return response.data;
        } catch (error) {
            log.error('Start node error:', error.response?.data || error.message);
            throw error;
        }
    }

    async stopNode() {
        try {
            const timestamp = Date.now();
            const message = `Node deactivation request for ${this.wallet.address} at ${timestamp}`;
            const signature = await this.signMessage(message);

            const response = await axios.post(`${this.baseURL}/light-node/node-action/${this.wallet.address}/stop`, {
                sign: signature,
                timestamp: timestamp
            }, { headers: this.headers });

            return response.data;
        } catch (error) {
            log.error('Stop node error:', error.response?.data || error.message);
            throw error;
        }
    }

    async checkNodeStatus() {
        try {
            const response = await axios.get(
                `${this.baseURL}/light-node/node-status/${this.wallet.address}`,
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            log.error('Status check error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Points and Rewards
    async claimDailyPoints() {
        try {
            const timestamp = Date.now();
            const message = `I am claiming my daily node point for ${this.wallet.address} at ${timestamp}`;
            const signature = await this.signMessage(message);

            const response = await axios.post(`${this.baseURL}/light-node/claim-node-points`, {
                sign: signature,
                timestamp: timestamp,
                walletAddress: this.wallet.address
            }, { headers: this.headers });

            return response.data;
        } catch (error) {
            log.error('Claim points error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getNodePoints() {
        try {
            const response = await axios.get(
                `${this.baseURL}/referral/wallet-details/${this.wallet.address}`,
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            log.error('Get points error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Referral System
    async getReferralCode() {
        try {
            const response = await axios.get(
                `${this.baseURL}/referral/wallet-details/${this.wallet.address}`,
                { headers: this.headers }
            );
            return response.data?.data?.referralCode;
        } catch (error) {
            log.error('Get referral code error:', error.response?.data || error.message);
            throw error;
        }
    }

    async verifyReferralCode(code) {
        try {
            const response = await axios.post(`${this.baseURL}/referral/verify-referral-code`, {
                invite_code: code
            }, { headers: this.headers });
            return response.data;
        } catch (error) {
            log.error('Verify referral error:', error.response?.data || error.message);
            throw error;
        }
    }

    async registerWithReferral(code) {
        try {
            const response = await axios.post(
                `${this.baseURL}/referral/register-wallet/${code}`,
                { walletAddress: this.wallet.address },
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            log.error('Register referral error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Node Health
    async checkNodeHealth() {
        try {
            const response = await axios.get(
                `${this.baseURL}/light-node/health/${this.wallet.address}`,
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            log.error('Health check error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Tasks and Proofs
    async getTasks() {
        try {
            const response = await axios.get(
                `${this.baseURL}/tasks/${this.wallet.address}`,
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            log.error('Get tasks error:', error.response?.data || error.message);
            throw error;
        }
    }
}

export default LayerEdgeAPI; 
