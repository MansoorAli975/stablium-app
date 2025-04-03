window.addEventListener("DOMContentLoaded", () => {
  const wrapEthBtn = document.getElementById("wrapEthBtn");
  if (wrapEthBtn) wrapEthBtn.addEventListener("click", wrapEthToWeth);

  // Clear message if wallet is already connected (matches deposit.js behavior)
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
// Global function to clear connection messages
window.clearConnectionMessage = function () {
  const statusMessage = document.getElementById("statusMessage");
  if (
    statusMessage &&
    (statusMessage.innerText.includes("connect your wallet") ||
      statusMessage.innerText.includes("Please connect your wallet"))
  ) {
    statusMessage.style.display = "none";
    statusMessage.innerText = "";
  }
};

// Status bar functions (same as deposit.js)
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
    const startProgress = parseFloat(
      document.querySelector(".status-bar").style.width || "0"
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

async function wrapEthToWeth() {
  const wrapEthBtn = document.getElementById("wrapEthBtn");
  // Clear message immediately when function starts

  if (wrapEthBtn) wrapEthBtn.disabled = true;

  // FIXED: Check connection state via sessionStorage (like index.js does)
  const isWalletConnected =
    sessionStorage.getItem("walletConnected") === "true";

  if (!window.ethereum || !isWalletConnected) {
    showCustomMessage("Please connect your wallet first.", "error");
    if (wrapEthBtn) wrapEthBtn.disabled = false;
    return;
  }

  const wrapAmount = parseFloat(
    document.getElementById("wrapAmountInput").value
  );
  if (isNaN(wrapAmount) || wrapAmount <= 0) {
    showCustomMessage("Please enter a valid amount to wrap.", "error");
    if (wrapEthBtn) wrapEthBtn.disabled = false;
    return;
  }

  const amountInWei = ethers.utils.parseUnits(wrapAmount.toString(), "ether");
  const statusMessage = document.getElementById("statusMessage");

  try {
    resetStatusBar();
    statusMessage.style.display = "block";
    statusMessage.innerText = "Wrapping ETH to WETH...";

    await incrementStatusBar(25, 2000);

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    await incrementStatusBar(50, 2000);
    const tx = await wethContract
      .connect(signer)
      .deposit({ value: amountInWei });
    await tx.wait();
    await incrementStatusBar(100, 2000);

    statusMessage.innerText = `Successfully wrapped ${wrapAmount} ETH to WETH.`;
    await new Promise((resolve) => setTimeout(resolve, 4000));

    statusMessage.style.opacity = "0";
    await new Promise((resolve) => setTimeout(resolve, 800));

    statusMessage.innerText =
      "Please go to Deposit Collateral and Mint STB for the next step.";
    statusMessage.style.opacity = "1";
    await new Promise((resolve) => setTimeout(resolve, 8000));

    statusMessage.innerText = "";
    statusMessage.style.display = "none";
    resetStatusBar();
    document.getElementById("wrapAmountInput").value = "0.0";
    await updateBalances(provider, userAddress);
  } catch (error) {
    console.error("Error wrapping ETH:", error);
    statusMessage.innerText = error.message.includes(
      "user rejected transaction"
    )
      ? "Transaction rejected"
      : "Transaction failed";
    resetStatusBar();
    document.getElementById("wrapAmountInput").value = "0.0";
  } finally {
    if (wrapEthBtn) wrapEthBtn.disabled = false;
    setTimeout(() => {
      if (statusMessage) {
        statusMessage.style.display = "none";
        statusMessage.innerText = "";
      }
    }, 5000);
  }
}
