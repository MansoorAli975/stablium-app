//urlhardcode
// Update the provider to use Alchemy's RPC URL
//provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/k3fI7fjx7KvrzkLkMxsMiV-D-GD5Fh3B');

let stbeContract, stbContract, provider, signer, userAddress, wethContract;
// Contract addresses (replace these with your actual contract addresses)
const stbeContractAddress = "0x24D1658Ecf55dd42AE0ed2d8C54529db675b4649"; // STBEngine contract address
const stbContractAddress = "0x871a3905DbF6fE52973AF933Cda8D90E11260E3a"; // STB contract address
const helperConfigContractAddress =
  "0xC7f2Cf4845C6db0e1a1e91ED41Bcd0FcC1b0E141"; // HelperConfig contract address

// WETH Contract Address (Sepolia Testnet)
const wethContractAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81"; // WETH contract address on Sepolia

// ABIs

const erc20Abi = [
  {
    constant: false,
    inputs: [],
    name: "deposit",
    outputs: [],
    payable: true,
    stateMutability: "payable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "guy", type: "address" },
      { name: "wad", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "src", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
];

/////////////////////////////////////////////////////////////////////////////////

const stbeAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "tokenAddresses", type: "address[]", internalType: "address[]" },
      {
        name: "priceFeedAddresses",
        type: "address[]",
        internalType: "address[]",
      },
      { name: "stbAddress", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burnStb",
    inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "calculateHealthFactor",
    inputs: [
      { name: "totalStbMinted", type: "uint256", internalType: "uint256" },
      {
        name: "collateralValueInUsd",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "depositCollateral",
    inputs: [
      {
        name: "tokenCollateralAddress",
        type: "address",
        internalType: "address",
      },
      { name: "amountCollateral", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositCollateralAndMintStb",
    inputs: [
      {
        name: "tokenCollateralAddress",
        type: "address",
        internalType: "address",
      },
      { name: "amountCollateral", type: "uint256", internalType: "uint256" },
      { name: "amountStbToMint", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAccountCollateralValue",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "totalCollateralValueInUse",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountInformation",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [
      { name: "totalStbMinted", type: "uint256", internalType: "uint256" },
      {
        name: "collateralValueInUsd",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAdditionalFeedPrecision",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getCollateralBalanceOfUser",
    inputs: [
      { name: "user", type: "address", internalType: "address" },
      { name: "token", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCollateralTokenPriceFeed",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCollateralTokens",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getHealthFactor",
    inputs: [],
    outputs: [],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getHealthFactor",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLiquidationBonus",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getLiquidationPrecision",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getLiquidationThreshold",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getMinHealthFactor",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getPrecision",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getStb",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenAmountFromUsd",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "usdAmountInWei", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUsdValue",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "liquidate",
    inputs: [
      { name: "collateral", type: "address", internalType: "address" },
      { name: "user", type: "address", internalType: "address" },
      { name: "debtToCover", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "mintStb",
    inputs: [
      { name: "amountStbToMint", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "redeemCollateral",
    inputs: [
      {
        name: "tokenCollateralAddress",
        type: "address",
        internalType: "address",
      },
      { name: "amountCollateral", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "redeemCollateralForStb",
    inputs: [
      {
        name: "tokenCollateralAddress",
        type: "address",
        internalType: "address",
      },
      { name: "amountCollateral", type: "uint256", internalType: "uint256" },
      { name: "amountStbToBurn", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "CollateralDeposited",
    inputs: [
      { name: "user", type: "address", indexed: true, internalType: "address" },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CollateralRedeemed",
    inputs: [
      {
        name: "redeemedFrom",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "redeemedTo",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DebugAmount",
    inputs: [
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "STBEngine__BreaksHealthFactor",
    inputs: [
      { name: "userHealthFactor", type: "uint256", internalType: "uint256" },
    ],
  },
  { type: "error", name: "STBEngine__HealthFactorNotImproved", inputs: [] },
  { type: "error", name: "STBEngine__HealthFactorOk", inputs: [] },
  { type: "error", name: "STBEngine__MintFailed", inputs: [] },
  { type: "error", name: "STBEngine__NeedsMoreThanZero", inputs: [] },
  { type: "error", name: "STBEngine__NotAllowedToken", inputs: [] },
  { type: "error", name: "STBEngine__NotAllowedZeroAddress", inputs: [] },
  {
    type: "error",
    name: "STBEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength",
    inputs: [],
  },
  { type: "error", name: "STBEngine__TransferFailed", inputs: [] },
];

//////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stbAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "burn",
    inputs: [{ name: "_amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burnFrom",
    inputs: [
      { name: "account", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decreaseAllowance",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "subtractedValue", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "increaseAllowance",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "addedValue", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "_to", type: "address", internalType: "address" },
      { name: "_amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [{ name: "newOwner", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "spender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "to", type: "address", indexed: true, internalType: "address" },
      {
        name: "value",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "Stablium__BurnAmountExceedsBalance", inputs: [] },
  { type: "error", name: "Stablium__MustBeMoreThanZero", inputs: [] },
  { type: "error", name: "Stablium__NotZeroAddress", inputs: [] },
];

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

const helperConfigAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "BTC_USE_PRICE",
    inputs: [],
    outputs: [{ name: "", type: "int256", internalType: "int256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DECIMALS",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DEFAULT_ANVIL_KEY",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ETH_USE_PRICE",
    inputs: [],
    outputs: [{ name: "", type: "int256", internalType: "int256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "IS_SCRIPT",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "activeNetworkConfig",
    inputs: [],
    outputs: [
      { name: "wethUsdPriceFeed", type: "address", internalType: "address" },
      { name: "wbtcUsdPriceFeed", type: "address", internalType: "address" },
      { name: "weth", type: "address", internalType: "address" },
      { name: "wbtc", type: "address", internalType: "address" },
      { name: "deployerKey", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOrCreateAnvilEthConfig",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct HelperConfig.NetworkConfig",
        components: [
          {
            name: "wethUsdPriceFeed",
            type: "address",
            internalType: "address",
          },
          {
            name: "wbtcUsdPriceFeed",
            type: "address",
            internalType: "address",
          },
          { name: "weth", type: "address", internalType: "address" },
          { name: "wbtc", type: "address", internalType: "address" },
          { name: "deployerKey", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getSepoliaEthConfig",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct HelperConfig.NetworkConfig",
        components: [
          {
            name: "wethUsdPriceFeed",
            type: "address",
            internalType: "address",
          },
          {
            name: "wbtcUsdPriceFeed",
            type: "address",
            internalType: "address",
          },
          { name: "weth", type: "address", internalType: "address" },
          { name: "wbtc", type: "address", internalType: "address" },
          { name: "deployerKey", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
];

////start
// Track connection status
let walletConnected = false;

// Wait for DOM content to be fully loaded
window.addEventListener("DOMContentLoaded", () => {
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
  const walletAddressDiv = document.getElementById("walletAddress");

  if (connectWalletBtn)
    connectWalletBtn.addEventListener("click", connectWallet);
  if (walletAddressDiv)
    walletAddressDiv.addEventListener("click", connectWallet);
  if (disconnectWalletBtn)
    disconnectWalletBtn.addEventListener("click", disconnectWallet);

  // Check for session storage wallet state
  if (sessionStorage.getItem("walletConnected") === "true") {
    reconnectWallet();
  }
});

// Function to connect wallet
async function connectWallet() {
  if (!walletConnected && window.ethereum) {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      // Clear any wallet connection messages
      if (window.clearConnectionMessage) {
        clearConnectionMessage();
      }

      // Store connection state
      sessionStorage.setItem("walletConnected", "true");
      sessionStorage.setItem("userAddress", userAddress);

      // Add connected class to body
      document.body.classList.add("connected");

      updateUIOnConnect(userAddress);

      // Initialize contracts
      initializeContracts(signer);

      // Update balances
      await updateBalances(provider, userAddress);
    } catch (error) {
      console.error("Error during wallet connection:", error);
      showCustomMessage("Failed to connect wallet.", "error");
    }
  } else if (!window.ethereum) {
    showCustomMessage("Please install MetaMask to use this feature.", "error");
  }
}

window.userAddress = userAddress;

async function reconnectWallet() {
  if (sessionStorage.getItem("walletConnected") === "true") {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      document.body.classList.add("connected");

      updateUIOnConnect(userAddress);
      initializeContracts(signer);
      await updateBalances(provider, userAddress);
    } catch (error) {
      console.error("Error during wallet reconnection:", error);
      disconnectWallet();
    }
  }
}

// ✅ Run this function on every page load
window.addEventListener("DOMContentLoaded", reconnectWallet);

function disconnectWallet() {
  console.log("Disconnect Wallet function called.");

  if (sessionStorage.getItem("walletConnected") === "true") {
    sessionStorage.clear(); // ✅ Clear session storage to remove connection state
    resetUI(); // ✅ Reset the UI elements
    walletConnected = false; // ✅ Ensure the variable is updated
    document.body.classList.remove("connected");
    console.log("Wallet disconnected on all pages.");
  } else {
    console.warn("No wallet is currently connected.");
  }
}
////////////

function resetUI() {
  console.log("Resetting UI...");

  // Reset first Connect Wallet button
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  if (connectWalletBtn) {
    connectWalletBtn.textContent = "Connect Wallet";
    connectWalletBtn.disabled = false;
    console.log("Connect Wallet button reset.");
  }

  // Reset second Connect Wallet button
  const walletAddressDiv = document.getElementById("walletAddress");
  if (walletAddressDiv) {
    walletAddressDiv.textContent = "Connect Wallet";
    walletAddressDiv.disabled = false;
    console.log("Second Connect Wallet button reset.");
  }

  // Keep Disconnect Wallet button visible but disable it
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
  if (disconnectWalletBtn) {
    disconnectWalletBtn.disabled = true; // Disable the button
    disconnectWalletBtn.style.display = "inline-block"; // Keep it visible
    console.log("Disconnect Wallet button disabled but remains visible.");
  }

  // Reset balance fields and remove active class
  ["ethBalance", "wethBalance", "collateralBalance", "stbBalance"].forEach(
    (id) => {
      const element = document.getElementById(id);
      if (element) {
        element.innerText = "-";
        //element.classList.remove("active-balance"); // Remove active class
        element.closest(".balance-box").classList.remove("active-box"); // Remove active class from the box
        console.log(`Reset ${id} to "-".`);
      }
    }
  );

  // Reset all input fields to '0'
  const inputFields = document.querySelectorAll(".form-input");
  inputFields.forEach((input) => {
    input.value = "0";
  });

  walletConnected = false;
  console.log("UI reset successfully.");
}

// Update UI elements on wallet connection
function updateUIOnConnect(userAddress) {
  console.log("Updating UI for connected wallet:", userAddress);

  // Check and update elements conditionally
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  if (connectWalletBtn) {
    connectWalletBtn.textContent = "Wallet Connected";
    connectWalletBtn.disabled = true;
  }

  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
  if (disconnectWalletBtn) {
    disconnectWalletBtn.disabled = false; // Enable the button
    disconnectWalletBtn.style.display = "inline-block"; // Keep it visible
  }

  const userAddressDisplay = document.getElementById("userAddress");
  if (userAddressDisplay) {
    userAddressDisplay.textContent = `Connected: ${userAddress}`;
  }

  walletConnected = true; // Set wallet connection state to true
  console.log("UI updated successfully.");
}

// Make disconnectWallet globally accessible
window.disconnectWallet = disconnectWallet;

// Initialize contracts
function initializeContracts(signer) {
  stbeContract = new ethers.Contract(stbeContractAddress, stbeAbi, signer);
  stbContract = new ethers.Contract(stbContractAddress, stbAbi, signer);
  wethContract = new ethers.Contract(wethContractAddress, erc20Abi, signer);
}
async function updateBalances(provider, userAddress) {
  try {
    if (!provider || !userAddress) {
      console.error("Provider or user address is missing.");
      return;
    }

    // Clear connection message when updating balances
    if (window.clearConnectionMessage) {
      clearConnectionMessage();
    }

    const ethBalance = await provider.getBalance(userAddress);
    const formattedEth = ethers.utils.formatEther(ethBalance);
    const ethElement = document.getElementById("ethBalance");
    if (ethElement) {
      ethElement.innerText = parseFloat(formattedEth).toFixed(2);
      ethElement.closest(".balance-box").classList.add("active-box"); // Add active class to the box
    }

    const wethBalance = await wethContract.balanceOf(userAddress);
    const formattedWeth = ethers.utils.formatEther(wethBalance);
    const wethElement = document.getElementById("wethBalance");
    if (wethElement) {
      wethElement.innerText = parseFloat(formattedWeth).toFixed(2);
      wethElement.closest(".balance-box").classList.add("active-box"); // Add active class to the box
    }

    const collateralBalance = await stbeContract.getCollateralBalanceOfUser(
      userAddress,
      wethContractAddress
    );
    const formattedCollateral = ethers.utils.formatEther(collateralBalance);
    const collateralElement = document.getElementById("collateralBalance");
    if (collateralElement) {
      collateralElement.innerText = parseFloat(formattedCollateral).toFixed(2);
      collateralElement.closest(".balance-box").classList.add("active-box"); // Add active class to the box
    }

    const stbBalance = await stbContract.balanceOf(userAddress);
    const formattedStb = ethers.utils.formatEther(stbBalance);
    const stbElement = document.getElementById("stbBalance");
    if (stbElement) {
      stbElement.innerText = parseFloat(formattedStb).toFixed(2);
      stbElement.closest(".balance-box").classList.add("active-box"); // Add active class to the box
    }

    console.log("Balances updated successfully.");
  } catch (error) {
    console.error("Error fetching balances:", error);
  }
}

// Use this delay **only on specific pages where needed**, not globally
function delayedBalanceUpdate() {
  setTimeout(async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();
    await updateBalances(provider, userAddress);
  }, 5000); // Wait 5 seconds before updating balances
}

// Make the function globally accessible for other scripts
window.updateBalances = updateBalances;

// Update UI elements on wallet connection
function updateUIOnConnect(userAddress) {
  console.log("Updating UI for connected wallet:", userAddress);

  // Update first Connect Wallet button
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  if (connectWalletBtn) {
    connectWalletBtn.textContent = "Wallet Connected";
    connectWalletBtn.disabled = true;
  }

  // Update second Connect Wallet button (if exists)
  const walletAddressDiv = document.getElementById("walletAddress");
  if (walletAddressDiv) {
    walletAddressDiv.textContent = "Wallet Connected";
    walletAddressDiv.disabled = true;
  }

  // Ensure Disconnect Wallet button is enabled and visible
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
  if (disconnectWalletBtn) {
    disconnectWalletBtn.disabled = false; // Enable the button
    disconnectWalletBtn.style.display = "inline-block"; // Keep it visible
  }

  // Show connected wallet address
  const userAddressDisplay = document.getElementById("userAddress");
  if (userAddressDisplay) {
    userAddressDisplay.textContent = `Connected: ${userAddress}`;
  }

  walletConnected = true; // Set wallet connection state to true
  console.log("UI updated successfully.");
}

// Custom message display

function showCustomMessage(message, type) {
  const statusMessage = document.getElementById("statusMessage");
  statusMessage.style.display = "block";
  statusMessage.innerText = message; // Remove the prefix
}
