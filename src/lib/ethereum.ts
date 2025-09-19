// src/lib/ethereum.ts
import { supabase } from "@/integrations/supabase/client";
import { ethers } from "ethers";

/* ---------------- Contract config ---------------- */
const CONTRACT_ADDRESS = "0x0d0A38A501B2AD98248eD7E17b6025D9a55F5044";
const CONTRACT_ABI = [
  "function register(bytes32 uniqueId) external",
  "event Registered(address indexed wallet, bytes32 indexed uniqueId)",
];

/* ---------------- Ethereum helpers ---------------- */

/**
 * Get the first Ethereum account from MetaMask
 */
export async function getEthereumAccount(): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");

  const accounts: string[] = await (window as any).ethereum.request({
    method: "eth_requestAccounts",
  });

  if (!accounts || accounts.length === 0) throw new Error("No Ethereum accounts found");

  return accounts[0];
}

/**
 * Generate a random 32-byte hex string for uniqueId
 */
export function generateUniqueId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "0x" + Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Register the user on-chain and persist in Supabase
 * @param uniqueIdHex - 32-byte hex string
 * @param userId - Supabase user id
 * @param toast - optional toast function
 * @returns txHash
 */
export async function registerOnChainAndPersist(
  uniqueIdHex: string,
  userId?: string,
  toast?: any
): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const from = await signer.getAddress();

  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  try {
    const tx = await contract.register(uniqueIdHex); // ethers.js handles gas automatically
    if (toast) {
      toast({
        title: "Transaction sent",
        description: `Waiting for confirmation...`,
      });
    }

    const receipt = await tx.wait(); // wait for mining
    if (toast) {
      toast({
        title: "Transaction confirmed",
        description: `Tx hash: ${receipt.transactionHash.slice(0, 10)}...`,
      });
    }

    // Persist in Supabase
    if (userId) {
      await supabase.from("registrations").insert({
        user_id: userId,
        wallet: from,
        unique_id: uniqueIdHex,
        tx_hash: receipt.transactionHash,
      });
    }

    return receipt.transactionHash;
  } catch (err: any) {
    throw new Error("Blockchain transaction failed: " + (err.message || err));
  }
}
