require('dotenv').config();
const ethers = require('ethers');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

const PRIOR_ADDRESS = '0xc19Ec2EEBB009b2422514C51F9118026f1cD89ba';
const USDT_ADDRESS = '0x014397DaEa96CaC46DbEdcbce50A42D5e0152B2E';
const USDC_ADDRESS = '0x109694D75363A75317A8136D80f50F871E81044e';
const FAUCET_ADDRESS = '0xCa602D9E45E1Ed25105Ee43643ea936B8e2Fd6B7';
const RPC_URL = 'https://base-sepolia-rpc.publicnode.com/89e4ff0f587fe2a94c7a2c12653f4c55d2bda1186cb6c1c95bd8d8408fbdc014';
const CHAIN_ID = 84532;
const ROUTER_ADDRESS = '0x0f1DADEcc263eB79AE3e4db0d57c49a8b6178B0B';

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

const FAUCET_ABI = [
  "function claimTokens() external"
];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const SYMBOLS = {
  info: '📋',
  success: '✅',
  error: '❌',
  warning: '⚠️',
  pending: '⏳',
  wallet: '💳',
  eth: '💎',
  prior: '🔶',
  usdt: '💵',
  usdc: '💰',
  swap: '🔄',
  approve: '🔑',
  wait: '⌛',
  faucet: '💧'
};

function loadEnvWallets() {
  const wallets = [];
  let index = 1;
  
  while (process.env[`PRIVATE_KEY_${index}`]) {
    const privateKey = process.env[`PRIVATE_KEY_${index}`];
    wallets.push({
      privateKey,
      wallet: new ethers.Wallet(privateKey, provider),
      label: `Env Wallet ${index}`,
      source: 'env'
    });
    index++;
  }
  
  if (wallets.length === 0 && process.env.PRIVATE_KEY) {
    wallets.push({
      privateKey: process.env.PRIVATE_KEY,
      wallet: new ethers.Wallet(process.env.PRIVATE_KEY, provider),
      label: 'Default Env Wallet',
      source: 'env'
    });
  }
  
  return wallets;
}

async function loadGeneratedWallets() {
  const walletFile = path.join(__dirname, 'wallets.json');
  try {
    const data = await fs.readFile(walletFile, 'utf8');
    const wallets = JSON.parse(data);
    return wallets.map((w, index) => ({
      privateKey: w.privateKey,
      wallet: new ethers.Wallet(w.privateKey, provider),
      label: `Generated Wallet ${index + 1}`,
      source: 'generated',
      mnemonic: w.mnemonic
    }));
  } catch (error) {
    return [];
  }
}

async function generateAndSaveWallet() {
  try {
    const wallet = ethers.Wallet.createRandom();
    const walletData = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase,
      createdAt: new Date().toISOString()
    };
    
    const walletFile = path.join(__dirname, 'wallets.json');
    let existingWallets = [];
    
    try {
      const data = await fs.readFile(walletFile, 'utf8');
      existingWallets = JSON.parse(data);
      if (!Array.isArray(existingWallets)) existingWallets = [];
    } catch (error) {}
    
    existingWallets.push(walletData);
    await fs.writeFile(walletFile, JSON.stringify(existingWallets, null, 2));
    
    console.log(`${SYMBOLS.success} New wallet generated and saved to wallets.json:`);
    console.log(`  Address: ${walletData.address}`);
    console.log(`  Private Key: ${walletData.privateKey}`);
    console.log(`  Mnemonic: ${walletData.mnemonic}`);
    console.log(`${SYMBOLS.warning} Please store these credentials securely!`);
    
    return {
      privateKey: walletData.privateKey,
      wallet: new ethers.Wallet(walletData.privateKey, provider),
      label: `Generated Wallet ${existingWallets.length}`,
      source: 'generated',
      mnemonic: walletData.mnemonic
    };
  } catch (error) {
    console.log(`${SYMBOLS.error} Error generating wallet: ${error.message}`);
    return null;
  }
}

async function claimFaucet(walletObj) {
  const { wallet, label } = walletObj;
  const faucetContract = new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, wallet);
  
  try {
    console.log(`${SYMBOLS.faucet} ${label} | Claiming tokens from faucet...`);
    const tx = await faucetContract.claimTokens({
      gasLimit: ethers.utils.hexlify(200000)
    });
    console.log(`${SYMBOLS.pending} ${label} | Faucet claim transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`${SYMBOLS.success} ${label} | Faucet claim confirmed in block ${receipt.blockNumber}`);
    return true;
  } catch (error) {
    console.log(`${SYMBOLS.error} ${label} | Error claiming faucet: ${error.message}`);
    return false;
  }
}

function getRandomAmount() {
  return (Math.random() * 0.001 + 0.001).toFixed(6);
}

function getRandomToken() {
  return Math.random() < 0.5 ? 'USDT' : 'USDC';
}

async function approvePrior(walletObj, amount) {
  const { wallet, label } = walletObj;
  const priorContract = new ethers.Contract(PRIOR_ADDRESS, ERC20_ABI, wallet);
  
  try {
    const amountInWei = ethers.utils.parseUnits(amount, 18);
    const currentAllowance = await priorContract.allowance(wallet.address, ROUTER_ADDRESS);
    
    if (currentAllowance.gte(amountInWei)) {
      console.log(`${SYMBOLS.info} ${label} | Allowance for PRIOR already sufficient: ${ethers.utils.formatUnits(currentAllowance, 18)}`);
      return true;
    }

    console.log(`${SYMBOLS.pending} ${label} | Approving PRIOR...`);
    const tx = await priorContract.approve(ROUTER_ADDRESS, amountInWei, { gasLimit: 60000 });
    console.log(`${SYMBOLS.pending} ${label} | Approval transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`${SYMBOLS.success} ${label} | Approval confirmed in block ${receipt.blockNumber}`);
    return true;
  } catch (error) {
    console.log(`${SYMBOLS.error} ${label} | Error approving PRIOR: ${error.message}`);
    return false;
  }
}

async function swapPrior(walletObj, amount, tokenType) {
  const { wallet, label } = walletObj;
  
  try {
    const amountInWei = ethers.utils.parseUnits(amount, 18);
    const approved = await approvePrior(walletObj, amount);
    if (!approved) {
      console.log(`${SYMBOLS.warning} ${label} | Approval failed, aborting swap`);
      return false;
    }

    let txData;
    if (tokenType === 'USDT') {
      txData = '0x03b530a3' + ethers.utils.defaultAbiCoder.encode(['uint256'], [amountInWei]).slice(2);
    } else {
      txData = '0xf3b68002' + ethers.utils.defaultAbiCoder.encode(['uint256'], [amountInWei]).slice(2);
    }

    console.log(`${SYMBOLS.pending} ${label} | Swapping ${amount} PRIOR for ${tokenType}...`);
    const tx = await wallet.sendTransaction({
      to: ROUTER_ADDRESS,
      data: txData,
      gasLimit: ethers.utils.hexlify(500000)
    });
    console.log(`${SYMBOLS.pending} ${label} | Swap transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`${SYMBOLS.success} ${label} | Swap confirmed in block ${receipt.blockNumber}`);
    return true;
  } catch (error) {
    console.log(`${SYMBOLS.error} ${label} | Error swapping PRIOR for ${tokenType}: ${error.message}`);
    return false;
  }
}

async function checkBalances(walletObj) {
  const { wallet, label } = walletObj;
  const priorContract = new ethers.Contract(PRIOR_ADDRESS, ERC20_ABI, wallet);
  const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  
  try {
    console.log(`\n${SYMBOLS.wallet} ${label} (${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}):`);
    const priorBalance = await priorContract.balanceOf(wallet.address);
    const usdtBalance = await usdtContract.balanceOf(wallet.address);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    const ethBalance = await provider.getBalance(wallet.address);
    
    console.log(`  ${SYMBOLS.eth} ETH: ${ethers.utils.formatEther(ethBalance)}`);
    console.log(`  ${SYMBOLS.prior} PRIOR: ${ethers.utils.formatUnits(priorBalance, 18)}`);
    console.log(`  ${SYMBOLS.usdt} USDT: ${ethers.utils.formatUnits(usdtBalance, 6)}`);
    console.log(`  ${SYMBOLS.usdc} USDC: ${ethers.utils.formatUnits(usdcBalance, 6)}`);
  } catch (error) {
    console.log(`${SYMBOLS.error} ${label} | Error checking balances: ${error.message}`);
  }
}

function delay() {
  console.log(`${SYMBOLS.wait} Waiting for 10 seconds...`);
  return new Promise(resolve => setTimeout(resolve, 10000));
}

async function runWalletSwaps(walletObj, count) {
  const { label } = walletObj;
  console.log(`\n${SYMBOLS.info} Starting ${count} swap operations for ${label}...`);
  await checkBalances(walletObj);
  
  let successCount = 0;
  
  for (let i = 0; i < count; i++) {
    const amount = getRandomAmount();
    const token = getRandomToken();
    
    console.log(`\n${SYMBOLS.swap} ${label} | Swap ${i+1}/${count}: ${amount} PRIOR for ${token}`);
    const success = await swapPrior(walletObj, amount, token);
    if (success) successCount++;
    
    if (i < count - 1) await delay();
  }
  
  console.log(`\n${SYMBOLS.info} ${label} | Completed ${successCount}/${count} swap operations successfully`);
  await checkBalances(walletObj);
  return successCount;
}

async function runSelectedWallets(wallets, swapsPerWallet) {
  let totalSuccess = 0;
  let totalSwaps = swapsPerWallet * wallets.length;
  
  console.log(`\n${SYMBOLS.info} Processing ${wallets.length} wallet(s)`);
  
  for (let i = 0; i < wallets.length; i++) {
    const walletObj = wallets[i];
    console.log(`\n${SYMBOLS.wallet} Processing wallet ${i+1}/${wallets.length}: ${walletObj.label} (${walletObj.source})`);
    
    // Claim faucet first
    await claimFaucet(walletObj);
    await delay();
    
    // Then proceed with swaps
    const successes = await runWalletSwaps(walletObj, swapsPerWallet);
    totalSuccess += successes;
    
    if (i < wallets.length - 1) await delay();
  }
  
  console.log(`\n${SYMBOLS.info} All selected wallets processed. Total swap success: ${totalSuccess}/${totalSwaps}`);
}

async function main() {
  const cyan = '\x1b[36m';
  const reset = '\x1b[0m';
  
  const banner = `
${cyan}==========================================${reset}
${cyan} PRIOR TESTNET AUTO BOT - AIRDROP INSIDERS ${reset}         
${cyan}==========================================${reset}
  `;
  
  console.log(banner);
  console.log(`${SYMBOLS.info} Bot started on ${new Date().toISOString()}`);
  
  const envWallets = loadEnvWallets();
  const generatedWallets = await loadGeneratedWallets();
  
  console.log(`\n${SYMBOLS.info} Available wallets:`);
  console.log(`  Env wallets: ${envWallets.length}`);
  console.log(`  Generated wallets: ${generatedWallets.length}`);
  
  rl.question(`${SYMBOLS.info} Select operation:\n1. Generate new wallet\n2. Run swaps with env wallets\n3. Run swaps with generated wallets\n4. Run swaps with all wallets\nEnter choice (1-4): `, async (choice) => {
    if (choice === '1') {
      await generateAndSaveWallet();
      rl.close();
    } else if (choice === '2') {
      if (envWallets.length === 0) {
        console.log(`${SYMBOLS.error} No env wallets found. Please check your .env file`);
        rl.close();
        return;
      }
      await processSwaps(envWallets);
    } else if (choice === '3') {
      if (generatedWallets.length === 0) {
        console.log(`${SYMBOLS.error} No generated wallets found. Please generate some first`);
        rl.close();
        return;
      }
      await processSwaps(generatedWallets);
    } else if (choice === '4') {
      const allWallets = [...envWallets, ...generatedWallets];
      if (allWallets.length === 0) {
        console.log(`${SYMBOLS.error} No wallets found in either env or generated sources`);
        rl.close();
        return;
      }
      await processSwaps(allWallets);
    } else {
      console.log(`${SYMBOLS.error} Invalid choice. Please select 1-4`);
      rl.close();
      return;
    }
  });
}

async function processSwaps(wallets) {
  console.log(`${SYMBOLS.wallet} Loaded ${wallets.length} wallet(s):`);
  wallets.forEach((w, i) => {
    console.log(`  ${i+1}. ${w.label} (${w.source}) (${w.wallet.address.substring(0, 6)}...${w.wallet.address.substring(38)})`);
  });
  
  rl.question(`\n${SYMBOLS.info} How many swaps to perform per wallet? `, async (answer) => {
    const swapCount = parseInt(answer);
    
    if (isNaN(swapCount) || swapCount <= 0) {
      console.log(`${SYMBOLS.error} Please provide a valid number of swaps`);
      rl.close();
      return;
    }
    
    console.log(`${SYMBOLS.info} Will claim faucet and perform ${swapCount} swaps for each of ${wallets.length} wallet(s)`);
    rl.question(`${SYMBOLS.info} Proceed? (y/n) `, async (confirm) => {
      if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
        await runSelectedWallets(wallets, swapCount);
      } else {
        console.log(`${SYMBOLS.info} Operation canceled`);
      }
      rl.close();
    });
  });
}

if (require.main === module) {
  main().catch(error => {
    console.log(`${SYMBOLS.error} Fatal error: ${error.message}`);
    process.exit(1);
  });
}
