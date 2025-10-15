// script/abi_list.js
import { readFileSync } from "fs";

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function sig(f) {
    return `${f.name}(${(f.inputs || []).map(i => i.type).join(",")}) -> ${(f.outputs || []).map(o => o.type).join(",")}`;
}

const funcs = ABI.filter(x => x.type === "function");
funcs.sort((a, b) => a.name.localeCompare(b.name));

console.log("== Functions in ABI ==");
for (const f of funcs) {
    console.log(`• ${sig(f)} [${f.stateMutability}]`);
}
