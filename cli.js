import axios from 'axios';
import fs from 'fs';
import chalk from 'chalk';
import readline from 'readline';
import { faker } from '@faker-js/faker';
import { execSync } from 'child_process';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

// Banners
const ASCII_ART = `
███████  █████  ██    ██  █████  ███    ██ 
██      ██   ██ ██    ██ ██   ██ ████   ██ 
███████ ███████ ██    ██ ███████ ██ ██  ██ 
     ██ ██   ██  ██  ██  ██   ██ ██  ██ ██ 
███████ ██   ██   ████   ██   ██ ██   ████
`;

const BANNER = ASCII_ART;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const apiKeyFilePath = 'apikey.txt';
const headersFilePath = 'headers.json';
const proxyIndexFilePath = 'proxy_index.txt';
const walletFilePath = 'wallet.txt';
const proxiesFilePath = 'proxy.txt';

const agents = {
    "deployment_p5J9lz1Zxe7CYEoo0TZpRVay": "Professor"
};

let rateLimitExceeded = false;

function clearConsole() {
    execSync(process.platform === 'win32' ? 'cls' : 'clear');
}

function displayBanner() {
    clearConsole();
    console.log(chalk.cyan(BANNER));
}

// Utility functions
function loadApiKey() {
    if (fs.existsSync(apiKeyFilePath)) {
        return fs.readFileSync(apiKeyFilePath, 'utf-8').trim();
    }
    return 'your_groq_apikeys';
}

function saveApiKey(apiKey) {
    fs.writeFileSync(apiKeyFilePath, apiKey);
}

function loadHeaders() {
    if (fs.existsSync(headersFilePath)) {
        return JSON.parse(fs.readFileSync(headersFilePath, 'utf-8'));
    }
    return {};
}

function saveHeaders(headers) {
    fs.writeFileSync(headersFilePath, JSON.stringify(headers, null, 2));
}

function generateRandomUserAgent() {
    return faker.internet.userAgent({ deviceCategory: 'desktop' });
}

function loadProxies() {
    if (fs.existsSync(proxiesFilePath)) {
        return fs.readFileSync(proxiesFilePath, 'utf-8').split('\n').filter(Boolean);
    }
    return [];
}

function createProxyAgent(proxy) {
    const [protocol, host, port] = proxy.split(/:\/\/|:/);
    switch (protocol) {
        case 'http':
            return new HttpProxyAgent(`http://${host}:${port}`);
        case 'socks4':
            return new SocksProxyAgent(`socks4://${host}:${port}`);
        case 'socks5':
            return new SocksProxyAgent(`socks5://${host}:${port}`);
        default:
            throw new Error(`Unsupported proxy protocol: ${protocol}`);
    }
}

// Generate a random blockchain-AI question
async function generateRandomQuestion() {
    const apiKey = loadApiKey();
    const themes = [
        "Decentralized AI Governance",
        "AI-powered Smart Contracts",
        "Blockchain-based AI Marketplaces"
    ];
    const theme = themes[Math.floor(Math.random() * themes.length)];

    if (rateLimitExceeded) {
        return `How does ${theme} impact future technologies?`;
    }

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: `Generate a short question on '${theme}' in AI & Blockchain context.` }],
            temperature: 0.9
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        rateLimitExceeded = true;
        return `What are the challenges in ${theme}?`;
    }
}

// Processing wallets with agents
async function processWallet(wallet, headers, proxies, usedProxies) {
    console.log(chalk.greenBright(`Processing Wallet: ${wallet}`));

    let proxy = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : null;

    for (const [agentId, agentName] of Object.entries(agents)) {
        console.log(chalk.yellow(`Using Agent: ${agentName}`));

        for (let i = 0; i < 5; i++) {
            console.log(chalk.blue(`Iteration ${i + 1}`));
            const question = await generateRandomQuestion();
            console.log(chalk.cyan(`Question: ${question}`));

            try {
                const config = {
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers,
                        'User-Agent': generateRandomUserAgent()
                    }
                };

                if (proxy) {
                    config['httpAgent'] = createProxyAgent(proxy);
                    config['httpsAgent'] = createProxyAgent(proxy);
                    console.log(chalk.magenta(`Using Proxy: ${proxy}`));
                }

                const response = await axios.post(`https://${agentId}.stag-vxzy.zettablock.com/main`, { message: question }, config);
                console.log(chalk.green(`Response: ${response.data.choices[0].message.content}`));
            } catch (error) {
                console.error(chalk.red(`Error: ${error.message}`));
            }
        }
    }
}

// Main function
async function main() {
    displayBanner();
    const wallets = fs.existsSync(walletFilePath) ? fs.readFileSync(walletFilePath, 'utf-8').split('\n').filter(Boolean) : [];
    const proxies = loadProxies();
    const headers = loadHeaders();

    for (const wallet of wallets) {
        if (!headers[wallet]) {
            headers[wallet] = { 'User-Agent': generateRandomUserAgent() };
            saveHeaders(headers);
        }

        await processWallet(wallet, headers, proxies, new Set());
    }
}

// Menu functions
async function showMenu() {
    displayBanner();
    console.log(chalk.yellow('\nMenu Options:'));
    console.log('1. Add Wallet');
    console.log('2. Set API Key');
    console.log('3. Reset Wallets');
    console.log('4. Delete API Key');
    console.log('5. Start Interaction');
    console.log('6. Exit');
}

async function handleMenuChoice() {
    while (true) {
        await showMenu();
        const choice = await new Promise(resolve => rl.question('\nEnter your choice (1-6): ', resolve));

        switch (choice) {
            case '1':
                await addWallet();
                break;
            case '2':
                await setApiKey();
                break;
            case '3':
                await resetWallets();
                break;
            case '4':
                await deleteApiKey();
                break;
            case '5':
                await main();
                break;
            case '6':
                rl.close();
                return;
            default:
                console.log(chalk.red('Invalid choice. Press Enter to continue...'));
                await new Promise(resolve => rl.question('', resolve));
        }
    }
}

async function addWallet() {
    const wallet = await new Promise(resolve => rl.question('Enter wallet address: ', resolve));
    fs.appendFileSync(walletFilePath, wallet + '\n');
    console.log(chalk.green('Wallet added successfully!'));
}

async function setApiKey() {
    const apiKey = await new Promise(resolve => rl.question('Enter API Key: ', resolve));
    saveApiKey(apiKey);
    console.log(chalk.green('API Key set successfully!'));
}

async function resetWallets() {
    fs.writeFileSync(walletFilePath, '');
    console.log(chalk.green('Wallets reset successfully!'));
}

async function deleteApiKey() {
    fs.writeFileSync(apiKeyFilePath, 'your_groq_apikeys');
    console.log(chalk.green('API Key deleted successfully!'));
}

// Start the menu
handleMenuChoice();
