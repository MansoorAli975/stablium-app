import { useState, useEffect } from "react";
import { ethers } from "ethers";

function WalletConnect({ setSigner, setUserAddress }) {
    const [walletAddress, setWalletAddress] = useState(null);

    const connectWallet = async () => {
        if (!window.ethereum) {
            alert("MetaMask not found. Please install it to use this app.");
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();

            setWalletAddress(address);
            setSigner(signer);
            setUserAddress(address);
        } catch (error) {
            console.error("Wallet connection failed:", error);
        }
    };

    const disconnectWallet = () => {
        setWalletAddress(null);
        setSigner(null);
        setUserAddress(null);
    };

    useEffect(() => {
        const checkAlreadyConnected = async () => {
            if (window.ethereum) {
                const accounts = await window.ethereum.request({ method: "eth_accounts" });
                if (accounts.length > 0) {
                    await connectWallet(); // Auto-connect if already authorized
                }
            }
        };
        checkAlreadyConnected();
    }, []);

    return (
        <div className="wallet-box">
            {walletAddress ? (
                <div className="wallet-info">
                    <span className="wallet-address">
                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </span>
                    <button className="disconnect-btn" onClick={disconnectWallet}>
                        Disconnect
                    </button>
                </div>
            ) : (
                <button className="connect-btn" onClick={connectWallet}>
                    Connect Wallet
                </button>
            )}
        </div>
    );
}

export default WalletConnect;
