import { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function WalletConnect({ setSigner, setUserAddress }) {
    const [connectedAddr, setConnectedAddr] = useState("");
    const [pendingAddr, setPendingAddr] = useState(""); // suggested by MetaMask switch

    const setAddr = (addr) => {
        const checksummed = addr ? ethers.getAddress(addr) : "";
        setConnectedAddr(checksummed);
        setUserAddress?.(checksummed || null);
    };

    async function connect() {
        if (!window.ethereum) throw new Error("MetaMask not found");
        const provider = new ethers.BrowserProvider(window.ethereum);
        const req = await provider.send("eth_requestAccounts", []);
        const selected =
            window.ethereum.selectedAddress ||
            (Array.isArray(req) && req.length ? req[0] : null);
        if (!selected) throw new Error("No account authorized");
        const signer = await provider.getSigner(selected);
        setSigner?.(signer);
        setAddr(await signer.getAddress());
        setPendingAddr(""); // clear any pending
    }

    function disconnect() {
        setSigner?.(null);
        setAddr("");
        setPendingAddr("");
    }

    // Listen but DO NOT auto-switch; store as "pending"
    useEffect(() => {
        if (!window.ethereum) return;

        const onAccounts = async (accounts) => {
            // No accounts -> treat like disconnect
            if (!accounts || accounts.length === 0) {
                disconnect();
                return;
            }
            try {
                const next = ethers.getAddress(accounts[0]);
                // If different from connected, propose switch instead of auto-switch
                if (connectedAddr && next !== connectedAddr) {
                    setPendingAddr(next);
                }
            } catch { }
        };

        const onChain = () => {
            // ignore chainChanged for switching; user can re-connect if needed
        };

        window.ethereum.on?.("accountsChanged", onAccounts);
        window.ethereum.on?.("chainChanged", onChain);
        return () => {
            window.ethereum.removeListener?.("accountsChanged", onAccounts);
            window.ethereum.removeListener?.("chainChanged", onChain);
        };
    }, [connectedAddr]);

    async function acceptPendingSwitch() {
        if (!pendingAddr) return;
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner(pendingAddr);
        setSigner?.(signer);
        setAddr(await signer.getAddress());
        setPendingAddr("");
    }

    function rejectPendingSwitch() {
        // Stay on current session
        setPendingAddr("");
    }

    return (
        <div className="wallet-card">
            <div className="wallet-title">Wallet</div>

            {connectedAddr ? (
                <>
                    <div className="wallet-address">
                        {connectedAddr.slice(0, 6)}…{connectedAddr.slice(-4)}
                    </div>
                    <button className="connect-btn" onClick={disconnect}>
                        Disconnect
                    </button>

                    {pendingAddr && (
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                            Switch detected to {pendingAddr.slice(0, 6)}…{pendingAddr.slice(-4)}?
                            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                                <button className="connect-btn" onClick={acceptPendingSwitch}>
                                    Switch
                                </button>
                                <button className="connect-btn" onClick={rejectPendingSwitch}>
                                    Stay
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <button className="connect-btn" onClick={connect}>
                    Connect Wallet
                </button>
            )}
        </div>
    );
}
