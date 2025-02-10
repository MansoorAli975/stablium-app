document.addEventListener("DOMContentLoaded", () => {
  console.log("STBE Contract Address:", stbeContractAddress);
  console.log("WETH Contract Address:", wethContractAddress);
});

////////REDEEM////////
document.getElementById("redeem-button").addEventListener("click", async () => {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const userAddress = await signer.getAddress();

  // Initialize contracts
  initializeContracts(signer);

  const stbAmount = parseFloat(document.getElementById("burn-stb").value);
  const redeemAmount = parseFloat(
    document.getElementById("redeem-collateral").value
  );

  if (!stbAmount || !redeemAmount || stbAmount <= 0 || redeemAmount <= 0) {
    showCustomMessage("Please enter valid amounts greater than zero.", "error");
    return;
  }

  // Convert input values to Wei
  const stbAmountInWei = ethers.utils.parseUnits(stbAmount.toString(), 18);
  const redeemAmountInWei = ethers.utils.parseUnits(
    redeemAmount.toString(),
    18
  );
  const redeemButton = document.getElementById("redeem-button");
  const statusMessage = document.getElementById("statusMessage");

  redeemButton.disabled = true; // Disable button during transaction
  statusMessage.style.display = "block";
  statusMessage.innerText = "Processing redemption... Please wait.";

  try {
    // Step 1: Check allowance
    const currentAllowance = await stbContract.allowance(
      userAddress,
      stbeContractAddress
    );
    if (currentAllowance.lt(stbAmountInWei)) {
      console.log("Approving STB for redemption...");
      statusMessage.innerText = "Approving STB for redemption...";
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
    const redeemTx = await stbeContract.redeemCollateralForStb(
      wethContractAddress, // WETH token collateral address
      redeemAmountInWei,
      stbAmountInWei
    );
    console.log("Redeem transaction sent:", redeemTx.hash);
    await redeemTx.wait();

    // Step 3: Success feedback
    statusMessage.innerText = `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`;
    showCustomMessage(
      `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`,
      "success"
    );

    // Delay balance update by 5 seconds
    setTimeout(async () => {
      await updateBalances(provider, userAddress);
    }, 5000); // 5 seconds delay
  } catch (error) {
    // Error feedback
    console.error("Error during redemption process:", error);
    const errorMessage =
      error.reason ||
      error.data?.message ||
      error.message ||
      "Unknown error occurred";
    statusMessage.innerText = "Transaction failed";
    showCustomMessage(errorMessage, "error");
  } finally {
    // Reset button state
    redeemButton.disabled = false;
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

// Attach event listeners for the input fields to dynamically toggle the button
document
  .getElementById("burn-stb")
  .addEventListener("input", toggleRedeemButton);
document
  .getElementById("redeem-collateral")
  .addEventListener("input", toggleRedeemButton);
