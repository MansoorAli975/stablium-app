// index.js
//////////////////////////////////////////////////
//urlhardcode---leave it for now- will see later
//const { ethers } = require('ethers');
//urlhardcode
/////////////////////////////////////////////////
//For now use the below URL in metamask sepolia network in case of problem 
// https://eth-sepolia.g.alchemy.com/v2/REDACTED


// Define variables for contracts
let dsceContract, dscContract, provider, signer, userAddress, wethContract;

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
const dsceContractAddress = "0xe78af35D5e26Ee2a2c515dAcaa6F2c78c1bC6AF5";  // DSCEngine contract address
const dscContractAddress = "0xDD00589Bb7512F3a4ed07Bc37F6E4F7Eb64504F4";  // DSC contract address
const helperConfigContractAddress = "0xC7f2Cf4845C6db0e1a1e91ED41Bcd0FcC1b0E141";  // HelperConfig contract address

// WETH Contract Address (Sepolia Testnet)
const wethContractAddress = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81"; // WETH contract address on Sepolia

// ABIs (replace these with your actual ABIs)

const erc20Abi = [
    {
      "constant": false,
      "inputs": [],
      "name": "deposit",
      "outputs": [],
      "payable": true,
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        { "name": "guy", "type": "address" },
        { "name": "wad", "type": "uint256" }
      ],
      "name": "approve",
      "outputs": [{ "name": "", "type": "bool" }],
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [{ "name": "src", "type": "address" }],
      "name": "balanceOf",
      "outputs": [{ "name": "balance", "type": "uint256" }],
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        { "name": "_to", "type": "address" },
        { "name": "_value", "type": "uint256" }
      ],
      "name": "transfer",
      "outputs": [{ "name": "", "type": "bool" }],
      "type": "function"
    }
  ];
  
  
const dsceAbi = [{
    "type": "constructor",
    "inputs": [
      {
        "name": "tokenAddresses",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "priceFeedAddresses",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "dscAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "burnDsc",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "calculateHealthFactor",
    "inputs": [
      {
        "name": "totalDscMinted",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "collateralValueInUsd",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "depositCollateral",
    "inputs": [
      {
        "name": "tokenCollateralAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountCollateral",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositCollateralAndMintDsc",
    "inputs": [
      {
        "name": "tokenCollateralAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountCollateral",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountDscToMint",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAccountCollateralValue",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "totalCollateralValueInUse",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAccountInformation",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "totalDscMinted",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "collateralValueInUsd",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAdditionalFeedPrecision",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getCollateralBalanceOfUser",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCollateralTokenPriceFeed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCollateralTokens",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDsc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getHealthFactor",
    "inputs": [],
    "outputs": [],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getHealthFactor",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLiquidationBonus",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getLiquidationPrecision",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getLiquidationThreshold",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getMinHealthFactor",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getPrecision",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getTokenAmountFromUsd",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "usdAmountInWei",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getUsdValue",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liquidate",
    "inputs": [
      {
        "name": "collateral",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "debtToCover",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "mintDsc",
    "inputs": [
      {
        "name": "amountDscToMint",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "redeemCollateral",
    "inputs": [
      {
        "name": "tokenCollateralAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountCollateral",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "redeemCollateralForDsc",
    "inputs": [
      {
        "name": "tokenCollateralAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountCollateral",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountDscToBurn",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "CollateralDeposited",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CollateralRedeemed",
    "inputs": [
      {
        "name": "redeemedFrom",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "redeemedTo",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DebugAmount",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "DSCEngine__BreaksHealthFactor",
    "inputs": [
      {
        "name": "userHealthFactor",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DSCEngine__HealthFactorNotImproved",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__HealthFactorOk",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__MintFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__NeedsMoreThanZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__NotAllowedToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__NotAllowedZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DSCEngine__TransferFailed",
    "inputs": []
  }
];
const dscAbi = [{
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "burn",
    "inputs": [
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "burnFrom",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decreaseAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "subtractedValue",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "increaseAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "addedValue",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "_to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "DecentralizedStableCoin__BurnAmountExceedsBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DecentralizedStableCoin__MustBeMoreThanZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DecentralizedStableCoin__NotZeroAddress",
    "inputs": []}];

    const helperConfigAbi = [{
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "BTC_USE_PRICE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DECIMALS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ANVIL_KEY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ETH_USE_PRICE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "IS_SCRIPT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activeNetworkConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "wethUsdPriceFeed",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "wbtcUsdPriceFeed",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "weth",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "wbtc",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deployerKey",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getOrCreateAnvilEthConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct HelperConfig.NetworkConfig",
        "components": [
          {
            "name": "wethUsdPriceFeed",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "wbtcUsdPriceFeed",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "weth",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "wbtc",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deployerKey",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getSepoliaEthConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct HelperConfig.NetworkConfig",
        "components": [
          {
            "name": "wethUsdPriceFeed",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "wbtcUsdPriceFeed",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "weth",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "wbtc",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deployerKey",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  }];

// Function to connect wallet
// Function to get and display the balances
async function getBalances() {
  try {
      // Get user's WETH balance
      const wethBalance = await wethContract.balanceOf(userAddress);
      const formattedWethBalance = ethers.utils.formatUnits(wethBalance, 18);
      console.log(`WETH Balance: ${formattedWethBalance} WETH`);
      document.getElementById('wethBalance').innerText = `WETH Balance: ${formattedWethBalance} WETH`;

      // Get user's DSC balance (if applicable)
      const dscBalance = await dscContract.balanceOf(userAddress);
      const formattedDscBalance = ethers.utils.formatUnits(dscBalance, 18);
      console.log(`DSC Balance: ${formattedDscBalance} DSC`);
      document.getElementById('dscBalance').innerText = `DSC Balance: ${formattedDscBalance} DSC`;

      // Get collateral balance (if applicable)
      const collateralBalance = await dsceContract.getCollateralBalanceOfUser(userAddress, wethContractAddress);
      const formattedCollateralBalance = ethers.utils.formatUnits(collateralBalance, 18);
      console.log(`Collateral Balance: ${formattedCollateralBalance} WETH`);
      document.getElementById('collateralBalance').innerText = `Collateral Balance: ${formattedCollateralBalance} WETH`;

  } catch (error) {
      console.error("Error fetching balances:", error);
      document.getElementById('statusMessage').innerText = `Error fetching balances: ${error.message || "Unknown error occurred"}`;
  }
}

// Utility to enable or disable a button based on input value
function toggleButton(buttonId, inputId) {
  const button = document.getElementById(buttonId);
  const inputValue = parseFloat(document.getElementById(inputId).value);
  button.disabled = isNaN(inputValue) || inputValue <= 0;
}
//////////////////////////////////////////////////////////////////////////////////////////////
// Track connection status
let walletConnected = false; 

// Connect Wallet function
async function connectWallet() {
    if (!walletConnected) { 
        if (window.ethereum) {
            try {
                // Initialize provider and signer
                provider = new ethers.providers.Web3Provider(window.ethereum);
                await provider.send("eth_requestAccounts", []); // Request wallet connection
                signer = provider.getSigner();
                userAddress = await signer.getAddress();

                // Update UI
                document.getElementById('walletAddress').innerText = `Connected: ${userAddress}`;
                document.getElementById('connectWalletBtn').textContent = "Disconnect Wallet"; // Update button text
                document.getElementById('getBalancesBtn').disabled = false; // Enable 'Get Balances' button

                // Initialize contracts
                dsceContract = new ethers.Contract(dsceContractAddress, dsceAbi, signer);
                dscContract = new ethers.Contract(dscContractAddress, dscAbi, signer);
                wethContract = new ethers.Contract(wethContractAddress, erc20Abi, signer);

                console.log("Wallet connected successfully.");

                // Attach additional event listeners
                document.getElementById('depositAndMintBtn').addEventListener('click', depositAndMint);
                document.getElementById('wrapEthButton').addEventListener('click', wrapEthToWeth);
                document.getElementById('getBalancesBtn').addEventListener('click', getBalances);

                // Validate inputs for button toggles
                toggleButton('wrapEthButton', 'wrapAmountInput');
                toggleButton('depositAndMintBtn', 'mintAmountInput');

                walletConnected = true; // Update connection status
            } catch (error) {
                console.error("Error during wallet connection:", error);
                showCustomMessage("Failed to connect wallet. Please check the console for details.", "error");
            }
        } else {
            showCustomMessage("Please install MetaMask to use this feature.", "error");
        }
    } else {
        disconnectWallet(); // Call disconnect function if already connected
    }
}

// Disconnect Wallet function
function disconnectWallet() {
    // Reset the UI
    document.getElementById('walletAddress').innerText = ""; // Clear wallet address
    document.getElementById('connectWalletBtn').textContent = "Connect Wallet"; // Reset button text
    document.getElementById('getBalancesBtn').disabled = true; // Disable 'Get Balances' button

    // Clear contracts and signer
    provider = null;
    signer = null;
    dsceContract = null;
    dscContract = null;
    wethContract = null;

    console.log("Wallet disconnected successfully.");
    walletConnected = false; // Update connection status
}

// Event listeners for dynamic button enabling
document.getElementById('wrapAmountInput').addEventListener('input', () => {
    toggleButton('wrapEthButton', 'wrapAmountInput');
});

document.getElementById('mintAmountInput').addEventListener('input', () => {
    toggleButton('depositAndMintBtn', 'mintAmountInput');
});

// Event listener for the 'Connect Wallet' button
document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);




// Wrap ETH to WETH
async function wrapEthToWeth() {
  const wrapAmount = parseFloat(document.getElementById('wrapAmountInput').value);
  if (isNaN(wrapAmount) || wrapAmount <= 0) {
      showCustomMessage("Please enter a valid amount to wrap.", "error");
      return;
  }

  const amountInWei = ethers.utils.parseUnits(wrapAmount.toString(), 18);

  try {
      console.log("Calling WETH deposit method...");
      
      // Ensure the status message is visible
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.style.display = 'block';  // Make sure it's visible
      statusMessage.innerText = 'Wrapping ETH to WETH... Please confirm in MetaMask.';
      
      const tx = await wethContract.deposit({ value: amountInWei });
      console.log("Wrap ETH transaction sent:", tx.hash);
      await tx.wait();
      console.log(`Successfully wrapped ${wrapAmount} ETH to WETH.`);
      
      // Update the status message with success
      statusMessage.innerText = `Successfully wrapped ${wrapAmount} ETH to WETH.`;
      getBalances();
  } catch (error) {
      console.error("Error wrapping ETH:", error);
      
      // Update the status message with error
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.style.display = 'block';  // Ensure it's visible
      statusMessage.innerText = `Error: ${error.message || "Unknown error occurred"}`;
  }
}
// Deposit collateral and mint DSC in one step
async function depositAndMint() {
  const depositAmount = parseFloat(document.getElementById('depositAmountInput').value);
  const mintAmount = parseFloat(document.getElementById('mintAmountInput').value);

  if (isNaN(depositAmount) || depositAmount <= 0 || isNaN(mintAmount) || mintAmount <= 0) {
      showCustomMessage("Please enter valid amounts for both deposit and mint.", "error");
      return;
  }

  const depositAmountInWei = ethers.utils.parseUnits(depositAmount.toString(), 18);
  const mintAmountInWei = ethers.utils.parseUnits(mintAmount.toString(), 18);

  try {
      console.log("Approving WETH for DSCEngine...");
      
      // Ensure the status message is visible
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.style.display = 'block';  // Make sure it's visible
      statusMessage.innerText = 'Approving WETH for deposit and minting...';
      
      const approveTx = await wethContract.approve(dsceContractAddress, ethers.constants.MaxUint256);
      console.log("Approve transaction sent:", approveTx.hash);
      await approveTx.wait();

      console.log("Estimating gas for depositCollateralAndMintDsc method...");
      statusMessage.innerText = 'Estimating gas for deposit and minting...';
      const estimatedGas = await dsceContract.estimateGas.depositCollateralAndMintDsc(
          wethContractAddress,
          depositAmountInWei,
          mintAmountInWei
      );

      console.log("Calling depositCollateralAndMintDsc method with increased gas limit...");
      statusMessage.innerText = 'Depositing collateral and minting DSC... Please confirm in MetaMask.';
      const depositAndMintTx = await dsceContract.depositCollateralAndMintDsc(
          wethContractAddress,
          depositAmountInWei,
          mintAmountInWei,
          {
              gasLimit: estimatedGas.add(ethers.BigNumber.from(90000)), // Add a buffer to the gas limit
          }
      );
      console.log("Deposit and mint transaction sent:", depositAndMintTx.hash);
      await depositAndMintTx.wait();

      console.log(`Successfully deposited ${depositAmount} WETH and minted ${mintAmount} DSC.`);
      statusMessage.innerText = `Successfully deposited ${depositAmount} WETH and minted ${mintAmount} DSC.`;
      getBalances();
  } catch (error) {
      console.error("Error during deposit and mint:", error);
      statusMessage.style.display = 'block'; // Ensure visibility
      statusMessage.innerText = `Error: ${error.message || "Unknown error occurred"}`;
  }
}


////////REDEEM////////

document.getElementById('redeem-button').addEventListener('click', async () => {
  const dscAmount = parseFloat(document.getElementById('burn-dsc').value);
  const redeemAmount = parseFloat(document.getElementById('redeem-collateral').value);

  if (!dscAmount || !redeemAmount || dscAmount <= 0 || redeemAmount <= 0) {
      showCustomMessage('Please enter valid amounts greater than zero.', "error");
      return;
  }

  // Convert input values to Wei
  const dscAmountInWei = ethers.utils.parseUnits(dscAmount.toString(), 18);
  const redeemAmountInWei = ethers.utils.parseUnits(redeemAmount.toString(), 18);
  const redeemButton = document.getElementById('redeem-button');
  const statusMessage = document.getElementById('statusMessage');

  redeemButton.disabled = true; // Disable button during transaction
  statusMessage.style.display = 'block';
  statusMessage.innerText = 'Processing redemption... Please wait.';

  try {
      // Step 1: Check allowance
      const currentAllowance = await dscContract.allowance(userAddress, dsceContractAddress);
      if (currentAllowance.lt(dscAmountInWei)) {
          console.log('Approving DSC for redemption...');
          statusMessage.innerText = 'Approving DSC for redemption...';
          const approveTx = await dscContract.approve(dsceContractAddress, dscAmountInWei);
          console.log('Approve transaction sent:', approveTx.hash);
          await approveTx.wait();
          statusMessage.innerText = 'DSC approved successfully.';
      } else {
          console.log('Sufficient allowance exists. Skipping approval step.');
      }

      // Step 2: Redeem collateral
      console.log('Calling redeemCollateralForDsc...');
      statusMessage.innerText = 'Redeeming collateral...';
      const redeemTx = await dsceContract.redeemCollateralForDsc(
          wethContractAddress, // WETH token collateral address
          redeemAmountInWei,
          dscAmountInWei
      );
      console.log('Redeem transaction sent:', redeemTx.hash);
      await redeemTx.wait();

      // Step 3: Success feedback
      statusMessage.innerText = `Successfully redeemed ${redeemAmount} WETH for ${dscAmount} DSC.`;
      showCustomMessage(`Successfully redeemed ${redeemAmount} WETH for ${dscAmount} DSC.`);
      
      getBalances(); // Update balances
      

  } catch (error) {
      // Error feedback
      console.error('Error during redemption process:', error);
      const errorMessage = error.reason || error.data?.message || error.message || 'Unknown error occurred';
      statusMessage.innerText = `Error during redemption: ${errorMessage}`;
      showCustomMessage(`Error during redemption: ${errorMessage}`);
  } finally {
      // Reset button state
      redeemButton.disabled = false;
      statusMessage.style.display = 'none'; // Hide status after completion
  }
});

// Utility to enable or disable the Redeem button based on inputs
function toggleRedeemButton() {
  const burnAmount = parseFloat(document.getElementById('burn-dsc').value);
  const redeemAmount = parseFloat(document.getElementById('redeem-collateral').value);
  const redeemButton = document.getElementById('redeem-button');

  redeemButton.disabled = isNaN(burnAmount) || burnAmount <= 0 || isNaN(redeemAmount) || redeemAmount <= 0;
}

// Attach event listeners for the input fields to dynamically toggle the button
document.getElementById('burn-dsc').addEventListener('input', toggleRedeemButton);
document.getElementById('redeem-collateral').addEventListener('input', toggleRedeemButton);

////////////////////////////////////////////////////////////////////////
//////////////TRANSFER FUNDS TO WALLET//////////////////////////////////
document.getElementById('transfer-button').addEventListener('click', async () => {
  const transferAmount = parseFloat(document.getElementById('transfer-amount').value);

  if (!transferAmount || transferAmount <= 0) {
      showCustomMessage('Please enter a valid amount.', "error");
      return;
  }

  const transferAmountInWei = ethers.utils.parseUnits(transferAmount.toString(), 18);
  const transferButton = document.getElementById('transfer-button');
  transferButton.disabled = true; // Disable button during transaction

  try {
      console.log('Unwrapping WETH to ETH and transferring to wallet...');
      
      // Ensure the status message is visible
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.style.display = 'block';  // Make sure it's visible
      statusMessage.innerText = 'Unwrapping WETH to ETH... Please confirm in MetaMask.';
      
      const wethContract = new ethers.Contract(wethContractAddress, ['function withdraw(uint256 wad)'], signer);
      const tx = await wethContract.withdraw(transferAmountInWei);
      console.log('Unwrap transaction sent:', tx.hash);
      await tx.wait();

      // Now transfer the ETH back to the wallet
      const tx2 = await signer.sendTransaction({
          to: userAddress,
          value: transferAmountInWei
      });
      console.log('ETH transfer transaction sent:', tx2.hash);
      statusMessage.innerText = 'Transferring ETH to your wallet... ';
      await tx2.wait();
      
      showCustomMessage(`Successfully transferred ${transferAmount} ETH (from WETH) to your wallet.`);
      getBalances(); // Update balances
  } catch (error) {
      console.error('Error during transfer process:', error);
      showCustomMessage(`Error during transfer: ${error.reason || error.message || 'Unknown error occurred'}`, "error");
      
      // Update status message for error
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.style.display = 'block'; // Ensure it's visible
      statusMessage.innerText = `Error during transfer: ${error.reason || error.message || 'Unknown error occurred'}`;
  } finally {
      transferButton.disabled = false; // Re-enable button
      
      // Hide the status message after process completes
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.style.display = 'none';
  }
});

// Enable or disable the Transfer button based on input
function toggleTransferButton() {
  const transferAmount = parseFloat(document.getElementById('transfer-amount').value);
  const transferButton = document.getElementById('transfer-button');
  transferButton.disabled = isNaN(transferAmount) || transferAmount <= 0;
}

// Attach event listeners for the input fields to dynamically toggle the button
document.getElementById('transfer-amount').addEventListener('input', toggleTransferButton);

/////////ALERTS///////////////////

function showCustomMessage(message, type = "info") {
  const statusMessage = document.getElementById('statusMessage');
  statusMessage.innerText = message;
  statusMessage.style.display = 'block';
  statusMessage.style.backgroundColor = type === "error" ? "#f8d7da" : "#d1e7dd"; // Error: red, Info: green
  statusMessage.style.borderColor = type === "error" ? "#f5c2c7" : "#badbcc";
  statusMessage.style.color = type === "error" ? "#842029" : "#0f5132";

  // Auto-hide after 5 seconds
  setTimeout(() => {
      statusMessage.style.display = 'none';
  }, 5000);
}
