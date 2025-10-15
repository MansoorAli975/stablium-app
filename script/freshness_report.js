// script/freshness_report.js
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;

const FEEDS = {
    "GBP/USD": "0x5bc612F21D49325c54E5C7a3c106adce3e07333F",
    "EUR/USD": "0x79cE6945D82f2E024A8555632411e6Bd38667fA7",
    "JPY/USD": "0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B",
};

const abi = [
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
];

function fmt(big, dpNum) {
    const s = BigInt(big).toString().padStart(dpNum + 1, "0");
    return s.slice(0, -dpNum) + "." + s.slice(-dpNum);
}

(async () => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const now = Math.floor(Date.now() / 1000);

    for (const [name, addr] of Object.entries(FEEDS)) {
        const f = new ethers.Contract(addr, abi, provider);
        const dpNum = Number(await f.decimals());
        const [, answer, , updatedAt] = await f.latestRoundData();

        const px = BigInt(answer);
        const age = now - Number(updatedAt);

        console.log(`${name}: ${fmt(px, dpNum)}  age=${age}s (dp=${dpNum})`);
    }
})();
