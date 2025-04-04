document.addEventListener("DOMContentLoaded", () => {
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
  const transferButton = document.querySelector(".transaction-btn");
  const transferInput = document.querySelector(".transaction-input");
  const statusMessage = document.getElementById("statusMessage");

  if (transferButton) {
    transferButton.addEventListener("click", async () => {
      const transferAmount = parseFloat(transferInput.value);

      if (!transferAmount || transferAmount <= 0) {
        showCustomMessage("Please enter a valid amount.", "error");
        return;
      }

      if (!window.ethereum || !walletConnected) {
        showCustomMessage("Please connect your wallet first.", "error");
        return;
      }

      try {
        transferButton.disabled = true; // Disable button during transaction
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();

        // Fetch user address securely
        let userAddress;
        try {
          userAddress = await signer.getAddress();
          console.log("Fetched user address:", userAddress);
        } catch (error) {
          console.error("Failed to fetch user address:", error);
          showCustomMessage(
            "Error fetching wallet address. Please reconnect.",
            "error"
          );
          return;
        }

        // Validate user address
        if (!userAddress || !ethers.utils.isAddress(userAddress)) {
          console.error("Invalid recipient address:", userAddress);
          showCustomMessage(
            "Invalid wallet address. Please reconnect.",
            "error"
          );
          return;
        }

        const transferAmountInWei = ethers.utils.parseUnits(
          transferAmount.toString(),
          "ether"
        );

        console.log("Preparing to unwrap WETH to ETH...");
        console.log("Transfer Amount (ETH):", transferAmount);
        console.log("Transfer Amount (Wei):", transferAmountInWei.toString());
        console.log("WETH Contract Address:", wethContractAddress);

        statusMessage.style.display = "block";
        statusMessage.innerText = "Unwrapping WETH to ETH...";

        // Increment status bar to 25% over 2 seconds
        await incrementStatusBar(25, 2000);

        // Step 1: Unwrap WETH to ETH
        const wethContract = new ethers.Contract(
          wethContractAddress,
          ["function withdraw(uint256 wad)"],
          signer
        );

        const unwrapTx = await wethContract.withdraw(transferAmountInWei);
        console.log("Unwrap TX Hash:", unwrapTx.hash);
        await unwrapTx.wait();
        console.log("WETH successfully unwrapped to ETH.");

        // Increment status bar to 50% over 2 seconds
        await incrementStatusBar(50, 2000);

        // Step 2: Transfer ETH back to wallet
        console.log("Initiating ETH transfer to:", userAddress);
        statusMessage.innerText = "Transferring ETH to your wallet...";

        const tx = await signer.sendTransaction({
          to: userAddress,
          value: transferAmountInWei,
        });

        console.log("ETH Transfer TX Hash:", tx.hash);
        await tx.wait();
        console.log("ETH successfully transferred to wallet.");

        // Increment status bar to 100% over 2 seconds
        await incrementStatusBar(100, 2000);

        statusMessage.innerText = `Successfully transferred ${transferAmount} ETH to your wallet.`;
        showCustomMessage(
          `Successfully transferred ${transferAmount} ETH to your wallet.`,
          "success"
        );

        // Reset the status bar after a delay
        setTimeout(() => {
          resetStatusBar();
        }, 3000); // Reset after 3 seconds

        // Reset input field to 0.0
        transferInput.value = "0.0";

        // Delay balance update by 5 seconds
        delayedBalanceUpdate();
      } catch (error) {
        console.error("Transaction failed:", error);
        let errorMessage = "Transaction failed"; // Default error message

        if (error.code === 4001) {
          errorMessage = "You cancelled the transaction."; // Custom message for user rejection
        } else {
          errorMessage =
            error.reason ||
            error.data?.message ||
            error.message ||
            "Unknown error occurred";
        }

        statusMessage.innerText = errorMessage;
        showCustomMessage("Transaction cancelled by user.", "error");

        // Reset input field to 0.0 on error
        transferInput.value = "0.0";

        // Reset the status bar immediately on error
        resetStatusBar();
      } finally {
        // Re-enable the "Transfer" button after the transaction is complete
        transferButton.disabled = false;

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
  }
});

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
