// index.js
//////////////////////////////////////////////////
//urlhardcode---leave it for now- will see later
//const { ethers } = require('ethers');
//urlhardcode
/////////////////////////////////////////////////
//For now use the below URL in metamask sepolia network in case of problem
//https://eth-sepolia.g.alchemy.com/v2/k3fI7fjx7KvrzkLkMxsMiV-D-GD5Fh3B

// Define variables for contracts
let stbeContract, stbContract, provider, signer, userAddress, wethContract;

/////////////////////////////////////////////////
//urlhardcode
// Update the provider to use Alchemy's RPC URL
//provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/k3fI7fjx7KvrzkLkMxsMiV-D-GD5Fh3B');

// Test the provider connection
//provider.getBlockNumber()
// .then((blockNumber) => {
//     console.log(`Connected to Sepolia via Alchemy. Current block number: ${blockNumber}`);
// })
// .catch((error) => {
//     console.error('Error connecting to Alchemy RPC:', error);
// });
//urlhc
/////////////////////////////////////////////////

// Contract addresses (replace these with your actual contract addresses)
const stbeContractAddress = "0x24D1658Ecf55dd42AE0ed2d8C54529db675b4649"; // STBEngine contract address
const stbContractAddress = "0x871a3905DbF6fE52973AF933Cda8D90E11260E3a"; // STB contract address
const helperConfigContractAddress =
  "0xC7f2Cf4845C6db0e1a1e91ED41Bcd0FcC1b0E141"; // HelperConfig contract address

// WETH Contract Address (Sepolia Testnet)
const wethContractAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81"; // WETH contract address on Sepolia

// ABIs (replace these with your actual ABIs)

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

// Track connection status
let walletConnected = false;

// Wait for DOM content to be fully loaded before attaching event listeners
document.addEventListener("DOMContentLoaded", () => {
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");

  // Ensure both elements exist
  if (connectWalletBtn && disconnectWalletBtn) {
    // Add event listeners for Connect and Disconnect Wallet buttons
    connectWalletBtn.addEventListener("click", connectWallet);
    disconnectWalletBtn.addEventListener("click", disconnectWallet);

    // Initially disable the Disconnect Wallet button
    disconnectWalletBtn.disabled = true;
  } else {
    console.error(
      "Connect Wallet or Disconnect Wallet button not found in DOM."
    );
  }
});

// Function to connect wallet
async function connectWallet() {
  if (!walletConnected) {
    if (window.ethereum) {
      try {
        // Initialize provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []); // Request wallet connection
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Store connection details in localStorage
        localStorage.setItem("walletConnected", "true");
        localStorage.setItem("userAddress", userAddress);

        // Update UI if elements are present
        const connectWalletBtn = document.getElementById("connectWalletBtn");
        const disconnectWalletBtn = document.getElementById(
          "disconnectWalletBtn"
        );
        const walletAddressDisplay = document.getElementById("walletAddress");

        if (connectWalletBtn) {
          connectWalletBtn.textContent = "Wallet Connected"; // Update button text
        }

        if (walletAddressDisplay) {
          walletAddressDisplay.textContent = "Wallet Connected"; // Update second button
        }

        if (disconnectWalletBtn) {
          disconnectWalletBtn.disabled = false; // Enable 'Disconnect Wallet' button
        }

        // Initialize contracts
        stbeContract = new ethers.Contract(
          stbeContractAddress,
          stbeAbi,
          signer
        );
        stbContract = new ethers.Contract(stbContractAddress, stbAbi, signer);
        wethContract = new ethers.Contract(
          wethContractAddress,
          erc20Abi,
          signer
        );

        console.log("Wallet connected successfully.");

        // Fetch balances after wallet is connected
        await updateBalances(provider, userAddress);

        // Attach additional event listeners if elements are present
        const depositAndMintBtn = document.getElementById("depositAndMintBtn");
        const wrapEthButton = document.getElementById("wrapEthButton");

        if (depositAndMintBtn) {
          depositAndMintBtn.addEventListener("click", depositAndMint);
        }

        if (wrapEthButton) {
          wrapEthButton.addEventListener("click", wrapEthToWeth);
        }

        // Validate inputs for button toggles
        toggleButton("wrapEthButton", "wrapAmountInput");
        toggleButton("depositAndMintBtn", "mintAmountInput");

        walletConnected = true; // Update connection status
      } catch (error) {
        console.error("Error during wallet connection:", error);
        showCustomMessage(
          "Failed to connect wallet. Please check the console for details.",
          "error"
        );
      }
    } else {
      showCustomMessage(
        "Please install MetaMask to use this feature.",
        "error"
      );
    }
  } else {
    disconnectWallet(); // Call disconnect function if already connected
  }
}

// Attach event listener for the second "Connect Wallet" button if present
const walletAddressButton = document.getElementById("walletAddress");
if (walletAddressButton) {
  walletAddressButton.addEventListener("click", connectWallet);
}

// Function to disconnect wallet
function disconnectWallet() {
  console.log("Disconnect Wallet button clicked.");

  if (walletConnected) {
    console.log("Wallet is connected. Proceeding to disconnect...");

    // Reset the Connect and Disconnect buttons
    const connectWalletBtn = document.getElementById("connectWalletBtn");
    const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");

    // Update button texts and disable the disconnect button
    if (connectWalletBtn) connectWalletBtn.textContent = "Connect Wallet"; // Update first button text
    if (document.getElementById("walletAddress"))
      document.getElementById("walletAddress").textContent = "Connect Wallet"; // Update second button text
    if (disconnectWalletBtn) disconnectWalletBtn.disabled = true; // Disable disconnect button

    // Clear wallet-related variables
    provider = null;
    signer = null;
    stbeContract = null;
    stbContract = null;
    wethContract = null;

    // Reset all balance fields to default ('-')
    const balanceFields = [
      "ethBalance",
      "wethBalance",
      "stbBalance",
      "collateralBalance",
    ];

    balanceFields.forEach((id) => {
      const balanceElement = document.getElementById(id);
      if (balanceElement) {
        balanceElement.innerText = "-"; // Reset balances to default
      }
    });

    // Reset other UI elements (input fields, etc.)
    const inputFields = [
      "depositAmountInput",
      "wrapAmountInput",
      "mintAmountInput",
    ];

    inputFields.forEach((id) => {
      const inputElement = document.getElementById(id);
      if (inputElement) {
        inputElement.value = ""; // Clear input fields
      }
    });

    console.log("Wallet disconnected successfully.");
    walletConnected = false; // Update connection status

    // Remove localStorage items
    localStorage.removeItem("walletConnected");
    localStorage.removeItem("userAddress");

    // Reload the page to reset the state completely
    setTimeout(() => {
      console.log("Page reloading to reset the state...");
      location.reload(); // Refresh the page after a short delay
    }, 100); // 100 ms delay before refresh
  } else {
    console.warn("No wallet is currently connected.");
  }
}

// On page load, check if the wallet is connected
window.onload = () => {
  const walletConnectedStatus = localStorage.getItem("walletConnected");
  if (walletConnectedStatus === "true") {
    walletConnected = true;
    const userAddress = localStorage.getItem("userAddress");

    // Set UI state based on stored values
    const connectWalletBtn = document.getElementById("connectWalletBtn");
    const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
    const walletAddressDisplay = document.getElementById("walletAddress");

    if (connectWalletBtn) {
      connectWalletBtn.textContent = "Wallet Connected"; // Update button text
    }

    if (walletAddressDisplay) {
      walletAddressDisplay.textContent = "Wallet Connected"; // Update second button
    }

    if (disconnectWalletBtn) {
      disconnectWalletBtn.disabled = false; // Enable 'Disconnect Wallet' button
    }

    // Initialize provider before updating balances
    if (window.ethereum) {
      provider = new ethers.providers.Web3Provider(window.ethereum);
      updateBalances(provider, userAddress);
    }
  }
};

/////////////////////////////////////////////////
// Function to update balances
// async function updateBalances(provider, address) {
//   if (!provider) {
//     console.error("Provider is not initialized.");
//     return;
//   }

//   try {
//     // Fetch ETH balance
//     const ethBalance = await provider.getBalance(address);
//     const ethFormatted = ethers.utils.formatEther(ethBalance);
//     document.querySelectorAll(".balance-value")[0].innerText =
//       parseFloat(ethFormatted).toFixed(2);

//     // Fetch WETH balance
//     const wethAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81";
//     const wethAbi = ["function balanceOf(address) view returns (uint256)"];
//     const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
//     const wethBalance = await wethContract.balanceOf(address);
//     const wethFormatted = ethers.utils.formatEther(wethBalance);
//     document.querySelectorAll(".balance-value")[1].innerText =
//       parseFloat(wethFormatted).toFixed(2);

//     // Fetch STB balance
//     const stbAddress = "0x871a3905DbF6fE52973AF933Cda8D90E11260E3a";
//     const stbAbi = ["function balanceOf(address) view returns (uint256)"];
//     const stbContract = new ethers.Contract(stbAddress, stbAbi, provider);
//     const stbBalance = await stbContract.balanceOf(address);
//     const stbFormatted = ethers.utils.formatEther(stbBalance);
//     document.querySelectorAll(".balance-value")[2].innerText =
//       parseFloat(stbFormatted).toFixed(2);

//     // Fetch Collateral balance (Updated logic)
//     const stbeAddress = "0x24D1658Ecf55dd42AE0ed2d8C54529db675b4649";
//     const stbeAbi = [
//       "function getCollateralBalanceOfUser(address user, address collateral) view returns (uint256)",
//       "function balanceOf(address) view returns (uint256)",
//     ];

//     const stbeContract = new ethers.Contract(stbeAddress, stbeAbi, provider);
//     const collateralBalance = await stbeContract.getCollateralBalanceOfUser(
//       address,
//       wethAddress
//     ); // Replace with the actual WETH address
//     const collateralFormatted = ethers.utils.formatEther(collateralBalance);
//     document.getElementById("collateralBalance").innerText =
//       parseFloat(collateralFormatted).toFixed(2);
//   } catch (error) {
//     console.error("Error updating balances:", error);
//   }
// }

// Function to update balances
// Consolidated function to update balances
// Function to update balances
// Consolidated function to update balances
async function updateBalances(provider, userAddress) {
  if (!provider) {
    console.error("Provider is not initialized.");
    return;
  }

  try {
    // Fetch ETH balance
    const ethBalance = await provider.getBalance(userAddress);
    const ethFormatted = ethers.utils.formatEther(ethBalance);
    document.querySelectorAll(".balance-value")[0].innerText =
      parseFloat(ethFormatted).toFixed(2);

    // Fetch WETH balance
    const wethBalance = await wethContract.balanceOf(userAddress);
    const wethFormatted = ethers.utils.formatEther(wethBalance);
    document.querySelectorAll(".balance-value")[1].innerText =
      parseFloat(wethFormatted).toFixed(2);

    // Fetch STB balance (use stbContract for STB balance)
    const stbBalance = await stbContract.balanceOf(userAddress);
    const stbFormatted = ethers.utils.formatEther(stbBalance);
    document.querySelectorAll(".balance-value")[2].innerText =
      parseFloat(stbFormatted).toFixed(2);

    // Fetch Collateral balance using getCollateralBalanceOfUser for stbeContract
    const collateralBalance = await stbeContract.getCollateralBalanceOfUser(
      userAddress, 
      wethAddress
    );
    const collateralFormatted = ethers.utils.formatEther(collateralBalance);
    document.getElementById("collateralBalance").innerText =
      parseFloat(collateralFormatted).toFixed(2);
  } catch (error) {
    console.error("Error updating balances:", error);
  }
}

// Utility to enable or disable a button based on input value
function toggleButton(buttonId, inputId) {
  const button = document.getElementById(buttonId);
  const inputElement = document.getElementById(inputId);
  if (button && inputElement) {
    const inputValue = parseFloat(inputElement.value);
    button.disabled = isNaN(inputValue) || inputValue <= 0;
  }
}

// Event listeners for dynamic button enabling
const wrapAmountInput = document.getElementById("wrapAmountInput");
if (wrapAmountInput) {
  wrapAmountInput.addEventListener("input", () => {
    toggleButton("wrapEthButton", "wrapAmountInput");
  });
}

const mintAmountInput = document.getElementById("mintAmountInput");
if (mintAmountInput) {
  mintAmountInput.addEventListener("input", () => {
    toggleButton("depositAndMintBtn", "mintAmountInput");
  });
}

// Event listener for window.onload to update balances
window.onload = async () => {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const userAddress = await provider.getSigner().getAddress();
    await updateBalances(provider, userAddress);
  } catch (error) {
    console.error("Error fetching balances on window load:", error);
  }
};


//////////////////
/////////check this later is required or not
///////////////////////////////////
// Event listener for the 'Connect Wallet' button
const connectWalletBtn = document.getElementById("connectWalletBtn");
if (connectWalletBtn) {
  connectWalletBtn.addEventListener("click", connectWallet);
}

//////////////////////////////////////////////////////////////////////////////
// Wrap ETH to WETH functionality
const wrapEthBtn = document.getElementById("wrapEthBtn");
if (wrapEthBtn) {
  wrapEthBtn.addEventListener("click", wrapEthToWeth);
}

async function wrapEthToWeth() {
  // Get the amount to wrap from input
  const wrapAmount = parseFloat(
    document.getElementById("wrapAmountInput").value
  );
  if (isNaN(wrapAmount) || wrapAmount <= 0) {
    showCustomMessage("Please enter a valid amount to wrap.", "error");
    return;
  }

  // Convert amount to Wei
  const amountInWei = ethers.utils.parseUnits(wrapAmount.toString(), 18);

  try {
    console.log("Preparing to wrap ETH to WETH...");

    // Initialize WETH contract if not already initialized
    if (!wethContract) {
      console.log("Initializing WETH contract...");
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const wethAbi = [
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
          inputs: [],
          name: "withdraw",
          outputs: [],
          payable: false,
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          constant: true,
          inputs: [{ name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "balance", type: "uint256" }],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ];
      wethContract = new ethers.Contract(wethContractAddress, wethAbi, signer);
      console.log("WETH contract initialized:", wethContract);
    }

    // Ensure the deposit method exists
    if (!wethContract.deposit) {
      throw new Error(
        "Deposit method not found on the WETH contract. Please verify the contract address and ABI."
      );
    }

    console.log("Calling WETH deposit method...");

    // Show status message
    const statusMessage = document.getElementById("statusMessage");
    statusMessage.innerText =
      "Wrapping ETH to WETH... Please confirm in MetaMask.";

    // Call deposit method
    const tx = await wethContract.deposit({ value: amountInWei });
    console.log("Wrap ETH transaction sent:", tx.hash);

    // Wait for transaction to be mined
    await tx.wait();
    console.log(`Successfully wrapped ${wrapAmount} ETH to WETH.`);

    // Update status message
    statusMessage.innerText = `Successfully wrapped ${wrapAmount} ETH to WETH.`;

    wrapAmountInput.value = 0;

    // Update balances after successful transaction
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const address = await provider.getSigner().getAddress();
    updateBalances(provider, address); // Update balances after wrapping ETH
  } catch (error) {
    console.error("Error wrapping ETH:", error);

    // Display error message
    const statusMessage = document.getElementById("statusMessage");
    statusMessage.innerText = `Error: ${
      error.message || "Unknown error occurred"
    }`;
  }
}
/////////////////////////////////////////////////////////////////////////////
// Deposit collateral and mint STB in one step
////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////

// Function to initialize contract instances for Deposit collateral and mint STB
// async function initialize() {
//   const provider = new ethers.providers.Web3Provider(window.ethereum);
//   const signer = provider.getSigner();

//   stbeContract = new ethers.Contract(stbeContractAddress, stbeAbi, signer);

//   wethAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81";
//   wethAbi = [
//     "function balanceOf(address) view returns (uint256)",
//     "function approve(address spender, uint256 amount) returns (bool)",
//   ];
//   wethContract = new ethers.Contract(wethAddress, wethAbi, signer);

//   console.log("Contracts initialized successfully.");
// }

// // Event listener for DOMContentLoaded
// document.addEventListener("DOMContentLoaded", () => {
//   const connectWalletBtn = document.getElementById("connectWalletBtn");
//   const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
//   const depositAndMintBtn = document.getElementById("depositAndMintBtn");

//   if (connectWalletBtn) {
//     connectWalletBtn.addEventListener("click", connectWallet);
//   }
//   if (disconnectWalletBtn) {
//     disconnectWalletBtn.addEventListener("click", disconnectWallet);
//   }
//   if (depositAndMintBtn) {
//     depositAndMintBtn.addEventListener("click", depositAndMint);
//   }
// });

// // Deposit collateral and mint STB functionality
// const depositAndMintBtn = document.getElementById("depositAndMintBtn");
// if (depositAndMintBtn) {
//   depositAndMintBtn.addEventListener("click", depositAndMint);
// }

// async function depositAndMint() {
//   // Validate input fields
//   const depositAmountInput = document.getElementById("depositAmountInput");
//   const mintAmountInput = document.getElementById("mintAmountInput");
//   const statusMessage = document.getElementById("statusMessage");

//   if (!depositAmountInput || !mintAmountInput || !statusMessage) {
//     console.error("Required DOM elements not found.");
//     return;
//   }

//   const depositAmount = parseFloat(depositAmountInput.value);
//   const mintAmount = parseFloat(mintAmountInput.value);

//   if (
//     isNaN(depositAmount) ||
//     depositAmount <= 0 ||
//     isNaN(mintAmount) ||
//     mintAmount <= 0
//   ) {
//     showCustomMessage(
//       "Please enter valid amounts for both deposit and mint.",
//       "error"
//     );
//     return;
//   }

//   statusMessage.textContent = ""; // Clear any previous messages

//   const depositAmountInWei = ethers.utils.parseUnits(
//     depositAmount.toString(),
//     18
//   );
//   const mintAmountInWei = ethers.utils.parseUnits(mintAmount.toString(), 18);

//   try {
//     console.log("Preparing to deposit and mint...");

//     // Initialize contracts if not already initialized
//     if (!stbeContract || !wethContract) {
//       console.log("Initializing contracts...");
//       await initialize();
//     }

//     // Approve WETH for STBEngine
//     showCustomMessage("Approving WETH for deposit and minting...", "info");
//     statusMessage.textContent = ""; // Clear any previous messages
//     const approveTx = await wethContract.approve(
//       stbeContractAddress,
//       ethers.constants.MaxUint256
//     );
//     console.log("Approve transaction sent:", approveTx.hash);
//     await approveTx.wait();

//     // Estimate gas for the transaction
//     let estimatedGas;
//     try {
//       console.log("Estimating gas for depositCollateralAndMintStb...");
//       estimatedGas = await stbeContract.estimateGas.depositCollateralAndMintStb(
//         wethContractAddress,
//         depositAmountInWei,
//         mintAmountInWei
//       );
//     } catch (gasError) {
//       console.warn("Gas estimation failed, using default gas limit.");
//       estimatedGas = ethers.BigNumber.from("300000"); // Fallback gas limit
//     }

//     // Call deposit and mint function
//     showCustomMessage(
//       "Depositing collateral and minting STB... Please confirm in MetaMask.",
//       "info"
//     );
//     statusMessage.textContent = "Waiting for user confirmation..."; // Notify user

//     const depositAndMintTx = await stbeContract.depositCollateralAndMintStb(
//       wethContractAddress,
//       depositAmountInWei,
//       mintAmountInWei,
//       {
//         gasLimit: estimatedGas.add(ethers.BigNumber.from("90000")), // Add buffer to estimated gas
//       }
//     );
//     console.log("Deposit and mint transaction sent:", depositAndMintTx.hash);
//     await depositAndMintTx.wait();

//     // Success message
//     console.log(
//       `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`
//     );
//     showCustomMessage(
//       `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`,
//       "success"
//     );

//     // Reset input fields to 0
//     depositAmountInput.value = 0; // Reset deposit amount input
//     mintAmountInput.value = 0; // Reset mint amount input

//     // Update balances
//     const provider = new ethers.providers.Web3Provider(window.ethereum);
//     const address = await provider.getSigner().getAddress();
//     await updateBalances(provider, address);
//   } catch (error) {
//     console.error("Error during deposit and mint:", error);
//     showCustomMessage(
//       `Error: ${error.message || "Unknown error occurred"}`,
//       "error"
//     );
//   }
// }

// Function to initialize contract instances for both Deposit collateral and mint STB, and redeem collateral
// Function to initialize contract instances for both Deposit collateral and mint STB, and redeem collateral
async function initializeContracts() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();

  // Initialize stbeContract and wethContract
  let stbeContractAddress = "0x24D1658Ecf55dd42AE0ed2d8C54529db675b4649"; // Set the correct address
  let stbeAbi = [
    "function getCollateralBalanceOfUser(address user, address collateral) view returns (uint256)",
  ];
  let stbeContract = new ethers.Contract(stbeContractAddress, stbeAbi, signer);
  console.log("stbeContract initialized:", stbeContract);

  let wethAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81";
  let wethAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];
  let wethContract = new ethers.Contract(wethAddress, wethAbi, signer);
  console.log("wethContract initialized:", wethContract);

  // Return the initialized contract instances
  return { stbeContract, wethContract };
}

// Function to update balances
async function updateBalances(
  provider,
  userAddress,
  stbeContract,
  wethContract
) {
  try {
    // Fetch STB balance
    const stbBalance = await stbeContract.balanceOf(userAddress);
    document.getElementById("stbBalance").innerText = ethers.utils.formatUnits(
      stbBalance,
      18
    );

    // Fetch WETH balance
    const wethBalance = await wethContract.balanceOf(userAddress);
    document.getElementById("wethBalance").innerText = ethers.utils.formatUnits(
      wethBalance,
      18
    );

    // Fetch Collateral balance (stbe balance)
    const collateralBalance = await stbeContract.getCollateralBalanceOfUser(
      userAddress,
      wethAddress // Use the correct collateral address here
    );
    document.getElementById("stbeBalance").innerText = ethers.utils.formatUnits(
      collateralBalance,
      18
    );
  } catch (error) {
    console.error("Error fetching balances:", error);
  }
}

// Event listener for DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize contracts and get contract instances
    const { stbeContract, wethContract } = await initializeContracts();
    console.log("DOM is fully loaded and contracts initialized.");

    // Update balances after contracts are initialized
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const userAddress = await signer.getAddress();
    await updateBalances(provider, userAddress, stbeContract, wethContract);
  } catch (error) {
    console.error("Error during initialization:", error);
  }
});

// Function to display custom messages
function showCustomMessage(message, type) {
  const statusMessage = document.getElementById("statusMessage");
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.className = type; // Type can be "error", "info", "success"
  }
}

// Deposit collateral and mint STB functionality
async function depositAndMint() {
  const depositAmountInput = document.getElementById("depositAmountInput");
  const mintAmountInput = document.getElementById("mintAmountInput");
  const statusMessage = document.getElementById("statusMessage");

  if (!depositAmountInput || !mintAmountInput || !statusMessage) {
    console.error("Required DOM elements not found.");
    return;
  }

  const depositAmount = parseFloat(depositAmountInput.value);
  const mintAmount = parseFloat(mintAmountInput.value);

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
    // Approve WETH for STBEngine
    showCustomMessage("Approving WETH for deposit and minting...", "info");
    const approveTx = await wethContract.approve(
      stbeContractAddress,
      ethers.constants.MaxUint256
    );
    await approveTx.wait();

    // Estimate gas for the transaction
    let estimatedGas;
    try {
      estimatedGas = await stbeContract.estimateGas.depositCollateralAndMintStb(
        wethContractAddress,
        depositAmountInWei,
        mintAmountInWei
      );
    } catch (gasError) {
      console.warn("Gas estimation failed, using default gas limit.");
      estimatedGas = ethers.BigNumber.from("300000");
    }

    // Call deposit and mint function
    showCustomMessage(
      "Depositing collateral and minting STB... Please confirm in MetaMask.",
      "info"
    );
    const depositAndMintTx = await stbeContract.depositCollateralAndMintStb(
      wethContractAddress,
      depositAmountInWei,
      mintAmountInWei,
      { gasLimit: estimatedGas.add(ethers.BigNumber.from("90000")) }
    );
    await depositAndMintTx.wait();

    // Success message
    showCustomMessage(
      `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} STB.`,
      "success"
    );

    // Reset input fields to 0
    depositAmountInput.value = 0;
    mintAmountInput.value = 0;

    // Update balances
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const address = await provider.getSigner().getAddress();
    await updateBalances(provider, address);
  } catch (error) {
    showCustomMessage(
      `Error: ${error.message || "Unknown error occurred"}`,
      "error"
    );
  }
}

// Redeem functionality
async function redeemCollateral() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const userAddress = await signer.getAddress();

  const stbAmount = parseFloat(document.getElementById("burn-stb")?.value || 0);
  const redeemAmount = parseFloat(
    document.getElementById("redeem-collateral")?.value || 0
  );

  if (
    isNaN(stbAmount) ||
    stbAmount <= 0 ||
    isNaN(redeemAmount) ||
    redeemAmount <= 0
  ) {
    showCustomMessage("Please enter valid amounts greater than zero.", "error");
    return;
  }

  const stbAmountInWei = ethers.utils.parseUnits(stbAmount.toString(), 18);
  const redeemAmountInWei = ethers.utils.parseUnits(
    redeemAmount.toString(),
    18
  );
  const redeemButton = document.getElementById("redeem-button");
  const statusMessage = document.getElementById("statusMessage");

  if (!redeemButton || !statusMessage) return;

  redeemButton.disabled = true;
  statusMessage.style.display = "block";
  statusMessage.innerText = "Processing redemption... Please wait.";

  try {
    // Step 1: Check allowance
    const currentAllowance = await stbeContract.allowance(
      userAddress,
      stbeContractAddress
    );
    if (currentAllowance.lt(stbAmountInWei)) {
      statusMessage.innerText = "Approving STB for redemption...";
      const approveTx = await stbeContract.approve(
        stbeContractAddress,
        stbAmountInWei
      );
      await approveTx.wait();
      statusMessage.innerText = "STB approved successfully.";
    }

    // Step 2: Redeem collateral
    statusMessage.innerText = "Redeeming collateral...";
    const redeemTx = await stbeContract.redeemCollateralForStb(
      wethAddress,
      redeemAmountInWei,
      stbAmountInWei
    );
    await redeemTx.wait();

    // Success feedback
    statusMessage.innerText = `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`;
    showCustomMessage(
      `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`,
      "success"
    );

    // Update balances
    await updateBalances(provider, userAddress);
  } catch (error) {
    statusMessage.innerText = `Error during redemption: ${
      error.message || "Unknown error"
    }`;
    showCustomMessage(
      `Error during redemption: ${error.message || "Unknown error"}`,
      "error"
    );
  } finally {
    redeemButton.disabled = false;
    statusMessage.style.display = "none";
  }
}

// // Utility function to update balances
// async function updateBalances(provider, userAddress) {
//   try {
//     const stbBalance = await stbContract.balanceOf(userAddress);
//     const wethBalance = await wethContract.balanceOf(userAddress);
//     const stbeBalance = await stbeContract.balanceOf(userAddress);
//     document.getElementById("stbBalance").innerText = ethers.utils.formatUnits(
//       stbBalance,
//       18
//     );
//     document.getElementById("wethBalance").innerText = ethers.utils.formatUnits(
//       wethBalance,
//       18
//     );
//     document.getElementById("stbeBalance").innerText = ethers.utils.formatUnits(
//       stbeBalance,
//       18
//     );
//   } catch (error) {
//     console.error("Error fetching balances:", error);
//   }
// }

////////////////////////////////////////
///////status bar////////////////////////
//////////////////////////////////////

// Function to display custom status messages
function showCustomMessage(message, status) {
  const statusBar = document.querySelector(".status-bar");
  const statusMessage = document.querySelector(".status-message");

  if (!statusBar || !statusMessage) {
    console.error("Status bar or message element not found.");
    return;
  }

  // Reset status bar classes
  statusBar.className = "status-bar"; // Remove all classes
  statusMessage.className = "status-message"; // Remove all classes

  // Add relevant status class
  if (status === "success") {
    statusBar.classList.add("success");
    statusMessage.classList.add("success");
  } else if (status === "error") {
    statusBar.classList.add("error");
    statusMessage.classList.add("error");
  } else {
    statusBar.classList.add("active");
    statusMessage.classList.add("active");
  }

  // Set the message text
  statusMessage.textContent = message;

  // Show the status bar
  statusBar.style.display = "block";

  // Automatically hide after 5 seconds (if not an error)
  if (status !== "error") {
    setTimeout(() => {
      statusBar.style.display = "none";
    }, 5000);
  }
}

/////////////////////////////////////////////////////////////////
// Redeem functionality
// Function to initialize contract instances
// async function initializeBurnPage() {
//   const provider = new ethers.providers.Web3Provider(window.ethereum);
//   const signer = provider.getSigner();

//   // Initialize contract instances
//   stbeContract = new ethers.Contract(stbeContractAddress, stbeAbi, signer);

//   wethAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81";
//   wethAbi = [
//     "function balanceOf(address) view returns (uint256)",
//     "function approve(address spender, uint256 amount) returns (bool)",
//   ];
//   wethContract = new ethers.Contract(wethAddress, wethAbi, signer);

//   console.log("Contracts initialized successfully.");

//   // Adding event listeners for elements specific to burn.html
//   const redeemButton = document.getElementById("redeem-button");
//   if (redeemButton) {
//     redeemButton.addEventListener("click", redeemCollateral);
//   } else {
//     console.warn("Redeem button not found in DOM.");
//   }
// }

// // Event listener for DOMContentLoaded
// document.addEventListener("DOMContentLoaded", async () => {
//   try {
//     await initializeBurnPage(); // Initialize contracts after DOM is ready
//     console.log("DOM is fully loaded and burn page initialized.");
//   } catch (error) {
//     console.error("Error during initialization:", error);
//   }
// });

// // Redeem functionality
// async function redeemCollateral() {
//   const provider = new ethers.providers.Web3Provider(window.ethereum);
//   const signer = provider.getSigner();
//   const userAddress = await signer.getAddress(); // Get user address

//   const stbAmount = parseFloat(document.getElementById("burn-stb")?.value || 0);
//   const redeemAmount = parseFloat(
//     document.getElementById("redeem-collateral")?.value || 0
//   );

//   if (!stbAmount || !redeemAmount || stbAmount <= 0 || redeemAmount <= 0) {
//     showCustomMessage("Please enter valid amounts greater than zero.", "error");
//     return;
//   }

//   // Convert input values to Wei
//   const stbAmountInWei = ethers.utils.parseUnits(stbAmount.toString(), 18);
//   const redeemAmountInWei = ethers.utils.parseUnits(
//     redeemAmount.toString(),
//     18
//   );
//   const redeemButton = document.getElementById("redeem-button");
//   const statusMessage = document.getElementById("statusMessage");

//   if (!redeemButton || !statusMessage) return; // Exit if required elements are not present

//   redeemButton.disabled = true; // Disable button during transaction
//   statusMessage.style.display = "block";
//   statusMessage.innerText = "Processing redemption... Please wait.";

//   try {
//     // Step 1: Check allowance
//     const currentAllowance = await stbeContract.allowance(
//       userAddress,
//       stbeContractAddress
//     );
//     if (currentAllowance.lt(stbAmountInWei)) {
//       console.log("Approving STB for redemption...");
//       statusMessage.innerText = "Approving STB for redemption...";
//       const approveTx = await stbeContract.approve(
//         stbeContractAddress,
//         stbAmountInWei
//       );
//       console.log("Approve transaction sent:", approveTx.hash);
//       await approveTx.wait();
//       statusMessage.innerText = "STB approved successfully.";
//     } else {
//       console.log("Sufficient allowance exists. Skipping approval step.");
//     }

//     // Step 2: Redeem collateral
//     console.log("Calling redeemCollateralForStb...");
//     statusMessage.innerText = "Redeeming collateral...";
//     const redeemTx = await stbeContract.redeemCollateralForStb(
//       wethAddress, // WETH token collateral address
//       redeemAmountInWei,
//       stbAmountInWei
//     );
//     console.log("Redeem transaction sent:", redeemTx.hash);
//     await redeemTx.wait();

//     // Step 3: Success feedback
//     statusMessage.innerText = `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`;
//     showCustomMessage(
//       `Successfully redeemed ${redeemAmount} WETH for ${stbAmount} STB.`
//     );

//     // Update balances
//     await updateBalances(provider, userAddress); // Update balances after redemption
//   } catch (error) {
//     // Error feedback
//     console.error("Error during redemption process:", error);
//     const errorMessage =
//       error.reason ||
//       error.data?.message ||
//       error.message ||
//       "Unknown error occurred";
//     statusMessage.innerText = `Error during redemption: ${errorMessage}`;
//     showCustomMessage(`Error during redemption: ${errorMessage}`);
//   } finally {
//     // Reset button state
//     redeemButton.disabled = false;
//     statusMessage.style.display = "none"; // Hide status after completion
//   }
// }

// // Utility function to update balances (assuming this function exists)
// async function updateBalances(provider, userAddress) {
//   try {
//     // Fetch balances of STB and WETH
//     const stbBalance = await stbeContract.balanceOf(userAddress);
//     const wethBalance = await wethContract.balanceOf(userAddress);
//     const stbeBalance = await stbeContract.balanceOf(userAddress);
//     // Update the UI elements for the balances
//     document.getElementById("stbBalance").innerText = ethers.utils.formatUnits(
//       stbBalance,
//       18
//     );
//     document.getElementById("wethBalance").innerText = ethers.utils.formatUnits(
//       wethBalance,
//       18
//     );

//     document.getElementById("stbeBalance").innerText = ethers.utils.formatUnits(
//       stbeBalance,
//       18
//     );
//   } catch (error) {
//     console.error("Error fetching balances:", error);
//   }
// }

////////////////////////////////////////////////////////////////////////
////////////// TRANSFER FUNDS TO WALLET //////////////////////////////

// Check if the required elements exist before adding functionality
if (
  document.getElementById("transfer-button") &&
  document.getElementById("transfer-amount")
) {
  document
    .getElementById("transfer-button")
    .addEventListener("click", async () => {
      const transferAmountInput = document.getElementById("transfer-amount");
      const transferAmount = parseFloat(transferAmountInput?.value || 0);

      if (!transferAmount || transferAmount <= 0) {
        showCustomMessage("Please enter a valid amount.", "error");
        return;
      }

      // Convert input to Wei
      const transferAmountInWei = ethers.utils.parseUnits(
        transferAmount.toString(),
        18
      );
      const transferButton = document.getElementById("transfer-button");
      const statusMessage = document.getElementById("statusMessage");

      transferButton.disabled = true; // Disable button during transaction

      try {
        console.log("Unwrapping WETH to ETH and transferring to wallet...");
        statusMessage.style.display = "block";
        statusMessage.innerText =
          "Unwrapping WETH to ETH... Please confirm in MetaMask.";

        // Interact with WETH contract to withdraw ETH
        const wethContract = new ethers.Contract(
          wethContractAddress,
          ["function withdraw(uint256 wad)"],
          signer
        );
        const unwrapTx = await wethContract.withdraw(transferAmountInWei);
        console.log("Unwrap transaction sent:", unwrapTx.hash);
        await unwrapTx.wait();

        // Transfer ETH back to the wallet
        const ethTransferTx = await signer.sendTransaction({
          to: userAddress,
          value: transferAmountInWei,
        });
        console.log("ETH transfer transaction sent:", ethTransferTx.hash);
        statusMessage.innerText = "Transferring ETH to your wallet...";
        await ethTransferTx.wait();

        showCustomMessage(
          `Successfully transferred ${transferAmount} ETH (from WETH) to your wallet.`
        );
        getBalances(); // Update balances
      } catch (error) {
        console.error("Error during transfer process:", error);

        const errorMessage =
          error.reason ||
          error.data?.message ||
          error.message ||
          "Unknown error occurred";

        showCustomMessage(`Error during transfer: ${errorMessage}`, "error");
        statusMessage.style.display = "block";
        statusMessage.innerText = `Error during transfer: ${errorMessage}`;
      } finally {
        transferButton.disabled = false; // Re-enable button
        statusMessage.style.display = "none"; // Hide status message
      }
    });

  // Utility function to toggle the Transfer button's disabled state
  function toggleTransferButton() {
    const transferAmountInput = document.getElementById("transfer-amount");
    const transferAmount = parseFloat(transferAmountInput?.value || 0);
    const transferButton = document.getElementById("transfer-button");

    if (transferButton) {
      transferButton.disabled = isNaN(transferAmount) || transferAmount <= 0;
    }
  }

  // Attach event listener to dynamically toggle the Transfer button
  document
    .getElementById("transfer-amount")
    .addEventListener("input", toggleTransferButton);
}

/////////ALERTS///////////////////

function showAlertMessage(message, type = "info") {
  const statusMessage = document.getElementById("statusMessage");
  if (statusMessage) {
    statusMessage.innerText = message;
    statusMessage.style.display = "block";
    statusMessage.style.backgroundColor =
      type === "error" ? "#f8d7da" : "#d1e7dd"; // Error: red, Info: green
    statusMessage.style.borderColor = type === "error" ? "#f5c2c7" : "#badbcc";
    statusMessage.style.color = type === "error" ? "#842029" : "#0f5132";

    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusMessage.style.display = "none";
    }, 5000);
  } else {
    console.warn(
      "Status message element is missing. Cannot display the message."
    );
  }
}
