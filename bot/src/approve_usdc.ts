import { ethers } from 'ethers';
import { CONFIG } from './config';
import * as dotenv from 'dotenv';
dotenv.config();

const PROCESS_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

async function main() {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
        console.error('Error: PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    // Connect
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(pk, provider);
    console.log(`Checking Wallet: ${wallet.address}`);

    // USDC Contract
    const usdc = new ethers.Contract(CONFIG.USDC_E_ADDRESS, PROCESS_ABI, wallet);

    // Check Balance
    const balance = await usdc.balanceOf(wallet.address);
    const balanceFmt = ethers.utils.formatUnits(balance, 6);
    console.log(`USDC Balance: $${balanceFmt}`);

    if (parseFloat(balanceFmt) < CONFIG.MIN_BALANCE_THRESHOLD) {
        console.warn(`Warning: Balance is low (< $${CONFIG.MIN_BALANCE_THRESHOLD}).`);
    }

    // Check Allowance
    const spender = CONFIG.EXCHANGE_PROXY;
    const allowance = await usdc.allowance(wallet.address, spender);
    const allowanceFmt = ethers.utils.formatUnits(allowance, 6);

    console.log(`Current Allowance for Exchange (${spender}): $${allowanceFmt}`);

    if (allowance.lt(ethers.utils.parseUnits("1000", 6))) {
        console.log('Allowance low. Approving Max Int...');

        try {
            const maxInt = ethers.constants.MaxUint256;

            // Hardcode High Gas to bypass "transaction gas price below minimum" errors
            // Polygon RPC requires > 25-30 Gwei Priority
            // NETWORK CONGESTION: Base Fee is ~600 Gwei. Setting Max to 1000 Gwei.
            const gasOverrides = {
                maxFeePerGas: ethers.utils.parseUnits('1000', 'gwei'),
                maxPriorityFeePerGas: ethers.utils.parseUnits('60', 'gwei')
            };

            console.log(`Using Hardcoded Gas: 1000 Gwei Max, 60 Gwei Priority`);

            const tx = await usdc.approve(spender, maxInt, gasOverrides);
            console.log(`Approval Tx Sent: ${tx.hash}`);
            await tx.wait();
            console.log('Approval Confirmed!');
        } catch (err) {
            console.error('Approval Failed:', err);
        }
    } else {
        console.log('Allowance is sufficient.');
    }
}

main();
