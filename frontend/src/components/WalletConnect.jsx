import { useState } from "react";
import { ethers } from "ethers";

function WalletConnect({ onConnect }) {
    const [walletAddress, setWalletAddress] = useState(null);

    const connectWallet = async () => {
        if (window.ethereum) {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            setWalletAddress(address);

            if (onConnect) {
                onConnect(address); // 📤 send address to parent
            }
        } else {
            alert("MetaMask not found. Please install it to use this app.");
        }
    };

    const disconnectWallet = () => {
        setWalletAddress(null);
    };

    return (
        <div>
            {walletAddress ? (
                <button className="disconnect-btn" onClick={disconnectWallet}>
                    Disconnect
                </button>
            ) : (
                <button className="connect-btn" onClick={connectWallet}>
                    Connect Wallet
                </button>
            )}
        </div>
    );
}

export default WalletConnect;
