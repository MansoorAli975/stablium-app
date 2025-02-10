// Check wallet connection and update UI accordingly
async function checkWalletConnection() {
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");

  try {
    if (window.ethereum) {
      const accounts = await ethereum.request({ method: "eth_accounts" });

      if (accounts.length > 0) {
        const userAddress = accounts[0];
        console.log("Wallet is connected:", userAddress);

        connectWalletBtn.innerText = "Wallet Connected";
        connectWalletBtn.disabled = true;
        disconnectWalletBtn.style.display = "inline-block";

        const provider = new ethers.providers.Web3Provider(window.ethereum);
        initializeContracts(provider);
        updateBalances(provider, userAddress);
      } else {
        console.log("No wallet connected.");
        resetWalletState();
      }
    } else {
      console.error("MetaMask is not installed.");
      resetWalletState();
    }
  } catch (error) {
    console.error("Error checking wallet connection:", error);
    resetWalletState();
  }
}

// Reset wallet UI and balances to default state
function resetWalletState() {
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");

  if (connectWalletBtn) {
    connectWalletBtn.innerText = "Connect Wallet";
    connectWalletBtn.disabled = false;
  }

  if (disconnectWalletBtn) {
    disconnectWalletBtn.style.display = "none";
  }

  // Reset balance fields
  ["ethBalance", "wethBalance", "stbBalance", "collateralBalance"].forEach(
    (id) => {
      const element = document.getElementById(id);
      if (element) {
        element.innerText = "-";
      }
    }
  );

  console.log("Wallet state reset successfully.");
}

// Disconnect wallet functionality
// Wrap.js: Ensure the disconnect button references the function from index.js
document
  .getElementById("disconnectWalletBtn")
  .addEventListener("click", function () {
    console.log("Disconnect button clicked in wrap.js");
    window.disconnectWallet(); // Calling the function from index.js
  });

// Wrap ETH to WETH
async function wrapEthToWeth() {
  const wrapAmount = parseFloat(
    document.getElementById("wrapAmountInput").value
  );
  if (isNaN(wrapAmount) || wrapAmount <= 0) {
    showCustomMessage("Please enter a valid amount to wrap.", "error");
    return;
  }

  const amountInWei = ethers.utils.parseUnits(wrapAmount.toString(), "ether");
  const statusMessage = document.getElementById("statusMessage");

  try {
    statusMessage.style.display = "block";
    statusMessage.innerText =
      "Wrapping ETH to WETH... Please confirm in MetaMask.";

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();

    // WETH Contract setup
    const wethContract = new ethers.Contract(
      wethContractAddress, // WETH address defined in index.js
      erc20Abi, // ERC20 ABI defined in index.js
      signer
    );

    // Wrap ETH into WETH
    const tx = await wethContract.deposit({ value: amountInWei });
    await tx.wait();

    statusMessage.innerText = `Successfully wrapped ${wrapAmount} ETH to WETH.`;
    const userAddress = await signer.getAddress();
    updateBalances(provider, userAddress); // Update balances after wrapping
  } catch (error) {
    console.error("Error wrapping ETH:", error);
    if (error.code === 4001) {
      // User rejected the transaction
      statusMessage.innerText = "Transaction cancelled.";
    } else {
      statusMessage.innerText = "Transaction cancelled.";
    }
  }
}

// Call checkWalletConnection on page load
window.onload = checkWalletConnection;

// Attach event listeners
document
  .getElementById("disconnectWalletBtn")
  .addEventListener("click", disconnectWallet);

document.getElementById("wrapEthBtn").addEventListener("click", wrapEthToWeth);
