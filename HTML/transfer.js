document.addEventListener("DOMContentLoaded", () => {
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

        statusMessage.innerText =
          "Unwrapping WETH to ETH... Please confirm in MetaMask.";

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

        showCustomMessage(
          `Successfully transferred ${transferAmount} ETH to your wallet.`,
          "success"
        );

        delayedBalanceUpdate();
      } catch (error) {
        console.error("Transaction failed:", error);
        showCustomMessage(
          `Transaction failed: ${
            error.reason || error.message || "Unknown error"
          }`,
          "error"
        );
      } finally {
        transferButton.disabled = false; // Re-enable button after transaction
      }
    });
  }
});
