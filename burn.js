// Wait for DOM content to be fully loaded
window.addEventListener("DOMContentLoaded", () => {
  const redeemButton = document.getElementById("redeem-button");
  if (redeemButton) redeemButton.addEventListener("click", burnAndRedeem);

  // Attach event listeners for the input fields to dynamically toggle the button
  document
    .getElementById("burn-stb")
    .addEventListener("input", toggleRedeemButton);
  document
    .getElementById("redeem-collateral")
    .addEventListener("input", toggleRedeemButton);

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

// Global function to clear connection messages (updated to match wrap.js)
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

// Status bar functions (updated to match wrap.js)
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

// Utility to enable or disable the Redeem button based on inputs
function toggleRedeemButton() {
  const burnAmount = parseFloat(document.getElementById("burn-stb").value);
  const redeemAmount = parseFloat(
    document.getElementById("redeem-collateral").value
  );

  const redeemButton = document.getElementById("redeem-button");

  redeemButton.disabled =
    isNaN(burnAmount) ||
    burnAmount <= 0 ||
    isNaN(redeemAmount) ||
    redeemAmount <= 0;
}

async function burnAndRedeem() {
  const redeemButton = document.getElementById("redeem-button");
  const statusMessage = document.querySelector(".status-message");
  const statusContainer = document.querySelector(".status-container");

  if (redeemButton) redeemButton.disabled = true;

  // Check connection state via sessionStorage (matches wrap.js)
  const isWalletConnected =
    sessionStorage.getItem("walletConnected") === "true";

  if (!window.ethereum || !isWalletConnected) {
    showCustomMessage("Please connect your wallet first.", "error");
    if (redeemButton) redeemButton.disabled = false;
    return;
  }

  const stbAmount = parseFloat(document.getElementById("burn-stb").value);
  const redeemAmount = parseFloat(
    document.getElementById("redeem-collateral").value
  );

  if (
    isNaN(stbAmount) ||
    stbAmount <= 0 ||
    isNaN(redeemAmount) ||
    redeemAmount <= 0
  ) {
    showCustomMessage("Please enter valid amounts greater than zero.", "error");
    if (redeemButton) redeemButton.disabled = false;
    return;
  }

  const stbAmountInWei = ethers.utils.parseUnits(stbAmount.toString(), "ether");
  const redeemAmountInWei = ethers.utils.parseUnits(
    redeemAmount.toString(),
    "ether"
  );

  try {
    resetStatusBar();
    if (statusContainer) statusContainer.style.display = "flex";
    if (statusMessage) {
      statusMessage.style.display = "block";
      statusMessage.innerText = "Approving STB for redemption...";
    }

    await incrementStatusBar(25, 2000);

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    // Check allowance and approve if needed
    const currentAllowance = await stbContract.allowance(
      userAddress,
      stbeContractAddress
    );
    if (currentAllowance.lt(stbAmountInWei)) {
      const approveTx = await stbContract
        .connect(signer)
        .approve(stbeContractAddress, stbAmountInWei);
      await approveTx.wait();
    }

    if (statusMessage) statusMessage.innerText = "Redeeming collateral...";
    await incrementStatusBar(50, 2000);

    // Redeem collateral
    const redeemTx = await stbeContract
      .connect(signer)
      .redeemCollateralForStb(
        wethContractAddress,
        redeemAmountInWei,
        stbAmountInWei
      );
    await redeemTx.wait();
    await incrementStatusBar(100, 2000);

    if (statusMessage) {
      statusMessage.innerText = `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`;
      await new Promise((resolve) => setTimeout(resolve, 4000));

      statusMessage.style.opacity = "0";
      await new Promise((resolve) => setTimeout(resolve, 800));

      statusMessage.innerText =
        "Please go to Transfer ETH to Wallet for the next step.";
      statusMessage.style.opacity = "1";
      await new Promise((resolve) => setTimeout(resolve, 8000));

      statusMessage.innerText = "";
      statusMessage.style.display = "none";
    }

    resetStatusBar();
    document.getElementById("burn-stb").value = "0.0";
    document.getElementById("redeem-collateral").value = "0.0";
    await updateBalances(provider, userAddress);
  } catch (error) {
    console.error("Error during redemption:", error);
    if (statusMessage) {
      statusMessage.innerText = error.message.includes(
        "user rejected transaction"
      )
        ? "Transaction rejected"
        : "Transaction failed";
    }
    resetStatusBar();
    document.getElementById("burn-stb").value = "0.0";
    document.getElementById("redeem-collateral").value = "0.0";
  } finally {
    if (redeemButton) redeemButton.disabled = false;
    setTimeout(() => {
      if (statusContainer) statusContainer.style.display = "none";
      if (statusMessage) {
        statusMessage.style.display = "none";
        statusMessage.innerText = "";
      }
    }, 5000);
  }
}
