import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import { getForexEngineContract } from "../utils/contract";

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
];

// Minimal IWETH ABI: deposit() payable
const WETH_ABI = [
    "function deposit() payable",
];

const WETH = import.meta?.env?.VITE_WETH_ADDRESS;

function parseAmount(amountStr, decimals) {
    try {
        return ethers.parseUnits((amountStr || "0").trim(), decimals);
    } catch {
        return 0n;
    }
}

const DepositBox = ({ signer, userAddress }) => {
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");

    const isConnected = Boolean(signer && userAddress);
    const canUse = useMemo(() => isConnected && Boolean(WETH), [isConnected]);

    const onDeposit = async () => {
        if (!isConnected) {
            alert("Please connect wallet first");
            return;
        }
        if (!WETH) {
            setStatus("⚠️ Missing VITE_WETH_ADDRESS in .env.local");
            return;
        }

        setBusy(true);
        setStatus("");

        try {
            const provider = signer.provider;
            const engine = getForexEngineContract(signer);
            const engineAddr =
                typeof engine.getAddress === "function"
                    ? await engine.getAddress()
                    : engine.target || import.meta.env.VITE_ENGINE_ADDRESS;

            // contracts
            const erc = new ethers.Contract(WETH, ERC20_ABI, signer);
            const weth = new ethers.Contract(WETH, WETH_ABI, signer);

            // decimals & target amount
            const dec = await erc.decimals().catch(() => 18);
            const amt = parseAmount(amount, dec);
            if (amt <= 0n) {
                setStatus("Enter a valid amount.");
                setBusy(false);
                return;
            }

            // Check balances
            const [wethBal, ethBal] = await Promise.all([
                erc.balanceOf(userAddress).catch(() => 0n),
                provider.getBalance(userAddress).catch(() => 0n),
            ]);

            // If not enough WETH but enough ETH → wrap first
            if (wethBal < amt) {
                if (ethBal < amt) {
                    setStatus("❌ Insufficient WETH and ETH for the requested amount.");
                    setBusy(false);
                    return;
                }
                setStatus("Wrapping ETH → WETH…");
                const txWrap = await weth.deposit({ value: amt });
                await txWrap.wait();
            }

            // Approve if needed
            const allowance = await erc.allowance(userAddress, engineAddr);
            if (allowance < amt) {
                setStatus("Approving WETH…");
                const txA = await erc.approve(engineAddr, amt);
                await txA.wait();
            }

            // Deposit WETH to engine
            setStatus("Depositing WETH…");
            const tx = await engine.depositCollateral(WETH, amt);
            await tx.wait();

            setStatus("✅ Deposit complete.");
            // Notify app to refresh balances immediately
            window.dispatchEvent(new CustomEvent("collateral:changed"));
            setAmount("");
        } catch (e) {
            setStatus("❌ " + (e?.reason || e?.message || String(e)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="deposit-box">
            <div className="deposit-title">Deposit WETH</div>

            <input
                className="deposit-input"
                type="text"
                placeholder="Amount WETH (auto-wrap ETH if needed)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!isConnected || busy}
            />

            <div className="deposit-actions">
                <button
                    className="primary-btn deposit-btn"
                    onClick={onDeposit}
                    disabled={busy}
                >
                    {busy ? "Working…" : "Deposit"}
                </button>
            </div>

            {status && <div className="deposit-status">{status}</div>}
            {!WETH && <div className="deposit-status">⚠️ Missing VITE_WETH_ADDRESS in .env.local</div>}
        </div>
    );
};

export default DepositBox;
