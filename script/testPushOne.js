// script/testPushOne.js  (ESM, ethers v6)
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract, parseUnits, formatEther } from 'ethers';

const FEEDS = {
    EUR: '0x79cE6945D82f2E024A8555632411e6Bd38667fA7',
    GBP: '0x5bc612F21D49325c54E5C7a3c106adce3e07333F',
    JPY: '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B',
    ETH: '0xd0947B75F6f85E2a2e2305074e330F306f22dD9f',
};

const ABI = [
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
    'function decimals() view returns (uint8)',
    'function updateAnswer(int256 _answer)',
];

function toScaled8(s) {
    const [i, fRaw = ''] = String(s).split('.');
    const f = (fRaw + '00000000').slice(0, 8);
    const str = `${i}${f}`.replace(/^(-?)0+(?=\d)/, '$1');
    return BigInt(str || '0');
}

async function main() {
    const symbol = (process.argv[2] || '').toUpperCase();
    const human = process.argv[3]; // e.g. "1.26510"
    if (!(symbol in FEEDS) || !human) {
        console.error('Usage: node script/testPushOne.js <EUR|GBP|JPY|ETH> <price>');
        process.exit(1);
    }

    const rpc = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
    const pk = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!rpc || !pk) throw new Error('Missing RPC or ORACLE_PRIVATE_KEY');

    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    console.log('Signer:', await wallet.getAddress());
    console.log('Sepolia ETH balance:', formatEther(await provider.getBalance(wallet.address)), 'ETH');

    const addr = FEEDS[symbol];
    const feed = new Contract(addr, ABI, wallet);
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const dec = Number(await feed.decimals());
    console.log(`Current ${symbol} answer=${answer} (dec=${dec}) updatedAt=${updatedAt}`);

    const target = toScaled8(human);
    console.log(`Try updateAnswer to: ${human} (raw ${target.toString()})`);

    const fd = await provider.getFeeData();
    const fees = {
        maxPriorityFeePerGas: (fd.maxPriorityFeePerGas ?? parseUnits('1', 'gwei')) + parseUnits('1', 'gwei'),
        maxFeePerGas: (fd.maxFeePerGas ?? parseUnits('20', 'gwei')) + parseUnits('1', 'gwei'),
    };

    // sanity: estimate first
    const gas = await feed.updateAnswer.estimateGas(target, fees);
    console.log('estimateGas OK:', gas.toString());
    console.log('feeData:', { maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(), maxFeePerGas: fees.maxFeePerGas.toString() });

    const tx = await feed.updateAnswer(target, fees);
    console.log('TX sent:', tx.hash);
    const rec = await tx.wait();
    console.log('Mined in block', rec.blockNumber, 'status', rec.status);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
