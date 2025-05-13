// Wait for DOM content to be fully loaded
window.addEventListener("DOMContentLoaded", () => {
  const transferEthBtn = document.getElementById("transferEthBtn");
  if (transferEthBtn) transferEthBtn.addEventListener("click", transferEth);

  // Clear message if wallet is already connected (matches wrap.js behavior)
  if (sessionStorage.getItem("walletConnected") === "true") {
    window.clearConnectionMessage();
  }
});

// Listen for wallet connection events
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    if (accounts.length > 0) {
      window.clearConnectionMessage();
    }
  });
}

// Status bar functions (consistent with other pages)
function updateStatusBar(progress) {
  const statusBar = document.querySelector(".status-bar");
  if (statusBar) {
    statusBar.style.width = `${progress}%`;
    statusBar.style.backgroundColor = "#00FFFF";
  }
}

function resetStatusBar() {
  const statusBar = document.querySelector(".status-bar");
  if (statusBar) {
    statusBar.style.width = "0%";
    statusBar.style.backgroundColor = "#747b8d";
  }
}

async function incrementStatusBar(targetProgress, duration) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const statusBar = document.querySelector(".status-bar");
    const startProgress = parseFloat(
      statusBar ? (statusBar.style.width || "0").replace("%", "") : "0"
    );
    const update = () => {
      const elapsedTime = Date.now() - startTime;
      const progress =
        startProgress +
        ((targetProgress - startProgress) * elapsedTime) / duration;
      updateStatusBar(progress);
      if (elapsedTime < duration) requestAnimationFrame(update);
      else {
        updateStatusBar(targetProgress);
        resolve();
      }
    };
    update();
  });
}

// Global function to clear connection messages
window.clearConnectionMessage = function () {
  const statusMessage = document.querySelector(".status-message");
  if (
    statusMessage &&
    (statusMessage.innerText.includes("connect your wallet") ||
      statusMessage.innerText.includes("Please connect your wallet"))
  ) {
    statusMessage.style.display = "none";
    statusMessage.innerText = "";
  }
};

async function transferEth() {
  const transferEthBtn = document.getElementById("transferEthBtn");
  const statusMessage = document.querySelector(".status-message");
  const statusContainer = document.querySelector(".status-container");

  if (transferEthBtn) transferEthBtn.disabled = true;

  // Check connection state via sessionStorage
  const isWalletConnected =
    sessionStorage.getItem("walletConnected") === "true";

  if (!window.ethereum || !isWalletConnected) {
    showCustomMessage("Please connect your wallet first.", "error");
    if (transferEthBtn) transferEthBtn.disabled = false;
    return;
  }

  const transferAmount = parseFloat(
    document.getElementById("transferAmountInput").value
  );

  if (isNaN(transferAmount) || transferAmount <= 0) {
    showCustomMessage("Please enter a valid amount to transfer.", "error");
    if (transferEthBtn) transferEthBtn.disabled = false;
    return;
  }

  const transferAmountInWei = ethers.utils.parseUnits(
    transferAmount.toString(),
    "ether"
  );

  try {
    resetStatusBar();
    if (statusContainer) statusContainer.style.display = "flex";
    if (statusMessage) {
      statusMessage.style.display = "block";
      statusMessage.innerText = "Preparing transfer...";
    }

    await incrementStatusBar(25, 2000);

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    if (statusMessage) statusMessage.innerText = "Unwrapping WETH to ETH...";
    await incrementStatusBar(50, 2000);

    // Unwrap WETH to ETH
    const wethContract = new ethers.Contract(
      wethContractAddress,
      ["function withdraw(uint256 wad)"],
      signer
    );
    const unwrapTx = await wethContract.withdraw(transferAmountInWei);
    await unwrapTx.wait();

    if (statusMessage)
      statusMessage.innerText = "Transferring ETH to your wallet...";
    await incrementStatusBar(75, 2000);

    // Transfer ETH to wallet
    const tx = await signer.sendTransaction({
      to: userAddress,
      value: transferAmountInWei,
    });
    await tx.wait();
    await incrementStatusBar(100, 2000);

    if (statusMessage) {
      statusMessage.innerText = `Successfully transferred ${transferAmount} ETH to your wallet.`;
      await new Promise((resolve) => setTimeout(resolve, 4000));

      statusMessage.style.opacity = "0";
      await new Promise((resolve) => setTimeout(resolve, 800));

      statusMessage.innerText = "Transfer completed successfully.";
      statusMessage.style.opacity = "1";
      await new Promise((resolve) => setTimeout(resolve, 3000));

      statusMessage.innerText = "";
      statusMessage.style.display = "none";
    }

    resetStatusBar();
    document.getElementById("transferAmountInput").value = "0.0";
    await updateBalances(provider, userAddress);
  } catch (error) {
    console.error("Error during transfer:", error);
    if (statusMessage) {
      statusMessage.innerText = error.message.includes(
        "user rejected transaction"
      )
        ? "Transaction rejected"
        : "Transaction failed";
    }
    resetStatusBar();
    document.getElementById("transferAmountInput").value = "0.0";
  } finally {
    if (transferEthBtn) transferEthBtn.disabled = false;
    setTimeout(() => {
      if (statusContainer) statusContainer.style.display = "none";
      if (statusMessage) {
        statusMessage.style.display = "none";
        statusMessage.innerText = "";
      }
    }, 5000);
  }
}
