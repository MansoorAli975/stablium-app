// src/config/engine.js

// Read from Vite env (prefix VITE_)
export const ENGINE_ADDRESS =
    import.meta.env.VITE_ENGINE_ADDRESS || "0x1da038c579096b9C11adD7af8429979D703Ae543"; // Sepolia fallback

export const RPC_URL = import.meta.env.VITE_RPC_URL || ""; // if blank, we'll fall back to window.ethereum

// Optional chain id (11155111 = Sepolia)
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "11155111");
