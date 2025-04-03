// Wait for DOM content to be fully loaded
window.addEventListener("DOMContentLoaded", () => {
  const depositAndMintBtn = document.getElementById("depositAndMintBtn");

  if (depositAndMintBtn) {
    depositAndMintBtn.addEventListener("click", depositAndMint);
  }

  // Clear message if wallet is already connected
  if (window.walletConnected) {
    window.clearConnectionMessage();
  }

  // Listen for wallet connection events
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length > 0) {
        window.clearConnectionMessage();
      }
    });
  }
});

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

// Function to update the status bar width
function updateStatusBar(progress) {
  const statusBar = document.querySelector(".status-bar");
  if (statusBar) {
    statusBar.style.width = `${progress}%`;
    statusBar.style.backgroundColor = "#00FFFF"; // Active color
  }
}

// Function to reset the status bar
function resetStatusBar() {
  const statusBar = document.querySelector(".status-bar");
  if (statusBar) {
    statusBar.style.width = "0%";
    statusBar.style.backgroundColor = "#747b8d"; // Inactive color
  }
}

// Function to clear "connect wallet" message (ADD THIS)
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

// Function to incrementally update the status bar
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

      if (elapsedTime < duration) {
        requestAnimationFrame(update);
      } else {
        updateStatusBar(targetProgress);
        resolve();
      }
    };

    update();
  });
}

async function depositAndMint() {
  const depositAndMintBtn = document.getElementById("depositAndMintBtn");
  if (depositAndMintBtn) {
    depositAndMintBtn.disabled = true; // Disable the button during the transaction
  }

  // Ensure wallet is connected before proceeding
  if (!window.ethereum || !walletConnected) {
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
    if (depositAndMintBtn) {
      depositAndMintBtn.disabled = false; // Re-enable the button if input is invalid
    }
    return;
  }

  const depositAmountInWei = ethers.utils.parseUnits(
    depositAmount.toString(),
    18
  );
  const mintAmountInWei = ethers.utils.parseUnits(mintAmount.toString(), 18);

  try {
    const statusMessage = document.getElementById("statusMessage");
    statusMessage.style.display = "block";
    statusMessage.innerText = "Approving WETH for deposit and minting...";

    // Increment status bar to 25% over 3.5 seconds
    await incrementStatusBar(25, 3500);

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    // Approve WETH for STBEngine
    const approveTx = await wethContract
      .connect(signer)
      .approve(stbeContractAddress, ethers.constants.MaxUint256);
    await approveTx.wait();

    statusMessage.innerText = "Estimating gas for deposit and minting...";

    // Increment status bar to 50% over 3 seconds
    await incrementStatusBar(50, 3000);

    // Estimate gas for depositCollateralAndMintStb
    const estimatedGas = await stbeContract
      .connect(signer)
      .estimateGas.depositCollateralAndMintStb(
        wethContractAddress,
        depositAmountInWei,
        mintAmountInWei
      );

    statusMessage.innerText = "Depositing collateral and minting STB...";

    // Increment status bar to 75% over 3 seconds
    await incrementStatusBar(75, 3000);

    // Deposit collateral and mint STB
    const depositAndMintTx = await stbeContract
      .connect(signer)
      .depositCollateralAndMintStb(
        wethContractAddress,
        depositAmountInWei,
        mintAmountInWei,
        {
          gasLimit: estimatedGas.add(ethers.BigNumber.from(90000)),
        }
      );

    await depositAndMintTx.wait();

    // Increment status bar to 100% over 3 seconds
    await incrementStatusBar(100, 3000);

    // After transaction completes:
    statusMessage.innerText = `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`;
    await new Promise((resolve) => setTimeout(resolve, 4000)); // Show for 4s

    // Smooth transition to next message
    statusMessage.style.opacity = "0";
    await new Promise((resolve) => setTimeout(resolve, 800)); // 0.8s fade

    statusMessage.innerText =
      "Please go to Burn STB and Redeem Collateral for the next step.";
    statusMessage.style.opacity = "1";
    await new Promise((resolve) => setTimeout(resolve, 8000)); // Show for 8s

    // Clean up
    statusMessage.innerText = "";
    statusMessage.style.display = "none";
    resetStatusBar();

    // Reset input fields to 0.0
    document.getElementById("depositAmountInput").value = "0.0";
    document.getElementById("mintAmountInput").value = "0.0";

    // Update balances
    await updateBalances(provider, userAddress);
  } catch (error) {
    console.error("Error during deposit and mint:", error);
    const statusMessage = document.getElementById("statusMessage");
    statusMessage.style.display = "block";
    statusMessage.innerText = "Transaction cancelled";
    resetStatusBar(); // Reset the status bar on error

    // Reset input fields to 0.0 on error
    document.getElementById("depositAmountInput").value = "0.0";
    document.getElementById("mintAmountInput").value = "0.0";
  } finally {
    // Re-enable the "Deposit and Mint" button after the transaction is complete
    const depositAndMintBtn = document.getElementById("depositAndMintBtn");
    if (depositAndMintBtn) {
      depositAndMintBtn.disabled = false;
    }

    // Clear the status message after a delay
    setTimeout(() => {
      const statusMessage = document.getElementById("statusMessage");
      if (statusMessage) {
        statusMessage.style.display = "none";
        statusMessage.innerText = "";
      }
    }, 5000); // Clear after 5 seconds
  }
}
