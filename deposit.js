// Wait for DOM content to be fully loaded
window.addEventListener("DOMContentLoaded", () => {
  const depositAndMintBtn = document.getElementById("depositAndMintBtn");
  if (depositAndMintBtn)
    depositAndMintBtn.addEventListener("click", depositAndMint);

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

async function depositAndMint() {
  const depositAndMintBtn = document.getElementById("depositAndMintBtn");
  const statusMessage = document.querySelector(".status-message");
  const statusContainer = document.querySelector(".status-container");

  if (depositAndMintBtn) depositAndMintBtn.disabled = true;

  // Check connection state via sessionStorage (matches wrap.js)
  const isWalletConnected =
    sessionStorage.getItem("walletConnected") === "true";

  if (!window.ethereum || !isWalletConnected) {
    showCustomMessage("Please connect your wallet first.", "error");
    if (depositAndMintBtn) depositAndMintBtn.disabled = false;
    return;
  }

  const depositAmount = parseFloat(
    document.getElementById("depositAmountInput").value
  );
  const mintAmount = parseFloat(
    document.getElementById("mintAmountInput").value
  );

  if (
    isNaN(depositAmount) ||
    depositAmount <= 0 ||
    isNaN(mintAmount) ||
    mintAmount <= 0
  ) {
    showCustomMessage(
      "Please enter valid amounts for both deposit and mint.",
      "error"
    );
    if (depositAndMintBtn) depositAndMintBtn.disabled = false;
    return;
  }

  const depositAmountInWei = ethers.utils.parseUnits(
    depositAmount.toString(),
    "ether"
  );
  const mintAmountInWei = ethers.utils.parseUnits(
    mintAmount.toString(),
    "ether"
  );

  try {
    resetStatusBar();
    if (statusContainer) statusContainer.style.display = "flex";
    if (statusMessage) {
      statusMessage.style.display = "block";
      statusMessage.innerText = "Approving WETH for deposit and minting...";
    }

    await incrementStatusBar(25, 2000);

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    // Approve WETH for STBEngine
    const approveTx = await wethContract
      .connect(signer)
      .approve(stbeContractAddress, ethers.constants.MaxUint256);
    await approveTx.wait();

    if (statusMessage)
      statusMessage.innerText = "Depositing collateral and minting STB...";
    await incrementStatusBar(50, 2000);

    // Deposit collateral and mint STB
    const depositAndMintTx = await stbeContract
      .connect(signer)
      .depositCollateralAndMintStb(
        wethContractAddress,
        depositAmountInWei,
        mintAmountInWei
      );

    await depositAndMintTx.wait();
    await incrementStatusBar(100, 2000);

    if (statusMessage) {
      statusMessage.innerText = `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`;
      await new Promise((resolve) => setTimeout(resolve, 4000));

      statusMessage.style.opacity = "0";
      await new Promise((resolve) => setTimeout(resolve, 800));

      statusMessage.innerText =
        "Please go to Burn STB and Redeem Collateral for the next step.";
      statusMessage.style.opacity = "1";
      await new Promise((resolve) => setTimeout(resolve, 8000));

      statusMessage.innerText = "";
      statusMessage.style.display = "none";
    }

    resetStatusBar();
    document.getElementById("depositAmountInput").value = "0.0";
    document.getElementById("mintAmountInput").value = "0.0";
    await updateBalances(provider, userAddress);
  } catch (error) {
    console.error("Error during deposit and mint:", error);
    if (statusMessage) {
      statusMessage.innerText = error.message.includes(
        "user rejected transaction"
      )
        ? "Transaction rejected"
        : "Transaction failed";
    }
    resetStatusBar();
    document.getElementById("depositAmountInput").value = "0.0";
    document.getElementById("mintAmountInput").value = "0.0";
  } finally {
    if (depositAndMintBtn) depositAndMintBtn.disabled = false;
    setTimeout(() => {
      if (statusContainer) statusContainer.style.display = "none";
      if (statusMessage) {
        statusMessage.style.display = "none";
        statusMessage.innerText = "";
      }
    }, 5000);
  }
}
