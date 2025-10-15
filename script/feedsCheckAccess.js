// script/feedsCheckAccess.js (ESM, ethers v6)
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const FEEDS = {
    EUR: '0x79cE6945D82f2E024A8555632411e6Bd38667fA7',
    GBP: '0x5bc612F21D49325c54E5C7a3c106adce3e07333F',
    JPY: '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B',
    ETH: '0xd0947B75F6f85E2a2e2305074e330F306f22dD9f',
};

const FEED_ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)',
    'function updateAnswer(int256 _answer)',
];

async function checkFeed(name, addr, signer, provider) {
    console.log(`\n=== ${name} (${addr}) ===`);
    const feedRead = new Contract(addr, FEED_ABI, provider);
    const feedWrite = feedRead.connect(signer);

    try {
        const { answer } = await feedRead.latestRoundData();
        const dec = await feedRead.decimals();
        console.log(`current answer: ${answer?.toString?.()} (decimals=${dec})`);

        // Try a STATICCALL of updateAnswer with a slightly different value.
        // If it reverts: signer is not authorized (or other guard failed).
        const next = BigInt(answer) + 1n;
        try {
            await feedWrite.updateAnswer.staticCall(next);
            console.log('✔ STATICCALL success: Account7 CAN update this feed.');
        } catch (e) {
            console.log('✖ STATICCALL revert: Account7 CANNOT update this feed.');
            console.log('  reason:', e?.shortMessage || e?.message || e);
        }
    } catch (e) {
        console.log(`Error checking ${addr}:`, e?.shortMessage || e?.message || e);
    }
}

async function main() {
    const rpc = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
    const pk = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!rpc) throw new Error('Missing SEPOLIA_RPC_URL / VITE_RPC_URL');
    if (!pk) throw new Error('Missing ORACLE_PRIVATE_KEY (or fallback PRIVATE_KEY)');

    const provider = new JsonRpcProvider(rpc);
    const signer = new Wallet(pk, provider);
    const addr = await signer.getAddress();
    console.log('Using signer (derived from ORACLE_PRIVATE_KEY):', addr);

    for (const [name, feedAddr] of Object.entries(FEEDS)) {
        await checkFeed(name, feedAddr, signer, provider);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
