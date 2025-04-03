// Wait for DOM content to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("STBE Contract Address:", stbeContractAddress);
  console.log("WETH Contract Address:", wethContractAddress);

  // Attach event listeners for the input fields to dynamically toggle the button
  document
    .getElementById("burn-stb")
    .addEventListener("input", toggleRedeemButton);
  document
    .getElementById("redeem-collateral")
    .addEventListener("input", toggleRedeemButton);

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

////////REDEEM////////
document.getElementById("redeem-button").addEventListener("click", async () => {
  const redeemButton = document.getElementById("redeem-button");
  const statusMessage = document.getElementById("statusMessage");

  if (redeemButton) {
    redeemButton.disabled = true; // Disable button during transaction
  }

  // Ensure wallet is connected before proceeding
  if (!window.ethereum || !walletConnected) {
    showCustomMessage("Please connect your wallet first.", "error");
    if (redeemButton) redeemButton.disabled = false;
    return;
  }

  const stbAmount = parseFloat(document.getElementById("burn-stb").value);
  const redeemAmount = parseFloat(
    document.getElementById("redeem-collateral").value
  );

  if (!stbAmount || !redeemAmount || stbAmount <= 0 || redeemAmount <= 0) {
    showCustomMessage("Please enter valid amounts greater than zero.", "error");
    if (redeemButton) {
      redeemButton.disabled = false; // Re-enable the button if input is invalid
    }
    return;
  }

  // Convert input values to Wei
  const stbAmountInWei = ethers.utils.parseUnits(stbAmount.toString(), 18);
  const redeemAmountInWei = ethers.utils.parseUnits(
    redeemAmount.toString(),
    18
  );

  statusMessage.style.display = "block";
  statusMessage.innerText = "Processing redemption... Please wait.";

  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    // Initialize contracts
    initializeContracts(signer);

    // Step 1: Check allowance
    const currentAllowance = await stbContract.allowance(
      userAddress,
      stbeContractAddress
    );
    if (currentAllowance.lt(stbAmountInWei)) {
      console.log("Approving STB for redemption...");
      statusMessage.innerText = "Approving STB for redemption...";

      // Increment status bar to 25% over 2 seconds
      await incrementStatusBar(25, 2000);

      const approveTx = await stbContract.approve(
        stbeContractAddress,
        stbAmountInWei
      );
      console.log("Approve transaction sent:", approveTx.hash);
      await approveTx.wait();

      statusMessage.innerText = "STB approved successfully.";
    } else {
      console.log("Sufficient allowance exists. Skipping approval step.");
    }

    // Step 2: Redeem collateral
    console.log("Calling redeemCollateralForStb...");
    statusMessage.innerText = "Redeeming collateral...";

    // Increment status bar to 50% over 2 seconds
    await incrementStatusBar(50, 2000);

    const redeemTx = await stbeContract.redeemCollateralForStb(
      wethContractAddress, // WETH token collateral address
      redeemAmountInWei,
      stbAmountInWei
    );
    console.log("Redeem transaction sent:", redeemTx.hash);
    await redeemTx.wait();

    // Increment status bar to 100% over 2 seconds
    await incrementStatusBar(100, 2000);

    // Step 3: Success feedback
    statusMessage.innerText = `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`;
    await new Promise((resolve) => setTimeout(resolve, 4000)); // Show for 4s

    // Smooth transition to next message
    statusMessage.style.opacity = "0";
    await new Promise((resolve) => setTimeout(resolve, 800)); // 0.8s fade

    statusMessage.innerText =
      "Please go to Transfer ETH to Wallet for the next step.";
    statusMessage.style.opacity = "1";
    await new Promise((resolve) => setTimeout(resolve, 8000)); // Show for 8s

    // Clean up
    statusMessage.innerText = "";
    statusMessage.style.display = "none";
    resetStatusBar();

    // Reset input fields to 0.0
    document.getElementById("burn-stb").value = "0.0";
    document.getElementById("redeem-collateral").value = "0.0";

    // Update balances
    await updateBalances(provider, userAddress);
  } catch (error) {
    // Error feedback
    console.error("Error during redemption process:", error);
    const errorMessage =
      error.reason ||
      error.data?.message ||
      error.message ||
      "Unknown error occurred";
    statusMessage.innerText = "Transaction failed";
    showCustomMessage("Transaction rejected by user.", "error");

    // Reset input fields to 0.0 on error
    document.getElementById("burn-stb").value = "0.0";
    document.getElementById("redeem-collateral").value = "0.0";

    // Reset the status bar immediately on error
    resetStatusBar();
  } finally {
    // Reset button state
    const redeemButton = document.getElementById("redeem-button");
    if (redeemButton) {
      redeemButton.disabled = false;
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
});

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
