import { ethers } from "ethers";
import forexEngineAbi from "../../../out/ForexEngine.sol/ForexEngine.json";

// ✅ Latest verified address after deployment
export const FOREX_ENGINE_ADDRESS = "0x5C93319809b1A30AB6B04EE3548847FB4D1f0008";

// ABI extracted from out folder
export const FOREX_ENGINE_ABI = forexEngineAbi.abi;

// Export contract getter function
export function getForexEngineContract(providerOrSigner) {
    if (!providerOrSigner) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        return new ethers.Contract(FOREX_ENGINE_ADDRESS, FOREX_ENGINE_ABI, provider);
    }
    return new ethers.Contract(FOREX_ENGINE_ADDRESS, FOREX_ENGINE_ABI, providerOrSigner);
}
