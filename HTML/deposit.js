// Wait for DOM content to be fully loaded
window.addEventListener("DOMContentLoaded", () => {
  const depositAndMintBtn = document.getElementById("depositAndMintBtn");

  if (depositAndMintBtn) {
    //depositAndMintBtn.addEventListener("click", depositAndMint);
    depositAndMintBtn.addEventListener("click", depositAndMint, { once: true });
  }
});

async function depositAndMint() {
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
    return;
  }

  const depositAmountInWei = ethers.utils.parseUnits(
    depositAmount.toString(),
    18
  );
  const mintAmountInWei = ethers.utils.parseUnits(mintAmount.toString(), 18);

  try {
    console.log("Approving WETH for STBEngine...");

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();

    const statusMessage = document.getElementById("statusMessage");
    statusMessage.style.display = "block";
    statusMessage.innerText = "Approving WETH for deposit and minting...";

    const approveTx = await wethContract
      .connect(signer)
      .approve(stbeContractAddress, ethers.constants.MaxUint256);
    console.log("Approve transaction sent:", approveTx.hash);
    await approveTx.wait();

    console.log("Estimating gas for depositCollateralAndMintStb method...");
    statusMessage.innerText = "Estimating gas for deposit and minting...";

    const estimatedGas = await stbeContract
      .connect(signer)
      .estimateGas.depositCollateralAndMintStb(
        wethContractAddress,
        depositAmountInWei,
        mintAmountInWei
      );

    console.log(
      "Calling depositCollateralAndMintStb method with increased gas limit..."
    );
    statusMessage.innerText =
      "Depositing collateral and minting STB... Please confirm in MetaMask.";

    const depositAndMintTx = await stbeContract
      .connect(signer)
      .depositCollateralAndMintStb(
        wethContractAddress,
        depositAmountInWei,
        mintAmountInWei,
        { gasLimit: estimatedGas.add(ethers.BigNumber.from(90000)) }
      );

    console.log("Deposit and mint transaction sent:", depositAndMintTx.hash);
    await depositAndMintTx.wait();

    console.log(
      `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`
    );
    statusMessage.innerText = `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`;

    // Delay balance update by 5 seconds
    setTimeout(async () => {
      await updateBalances(provider, userAddress);
    }, 5000); // 5 seconds delay
  } catch (error) {
    console.error("Error during deposit and mint:", error);
    statusMessage.style.display = "block";
    statusMessage.innerText = "Transaction cancelled";
  }
}
