// src/lib/ethereum.ts
import { supabase } from "@/integrations/supabase/client";

/* ---------------- Contract config ---------------- */
const CONTRACT_ADDRESS = "0x0d0A38A501B2AD98248eD7E17b6025D9a55F5044";
// Function selector for register(bytes32)
const REGISTER_SELECTOR = "0x2f2ff15d";

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

  const from = await getEthereumAccount();

  // Left-pad uniqueId to 32 bytes
  const calldata = REGISTER_SELECTOR + uniqueIdHex.slice(2).padStart(64, "0");

  try {
    // Send transaction via MetaMask
    const txParams: any = {
      from,
      to: CONTRACT_ADDRESS,
      data: calldata,
      gas: "0x186A0", // 100000 gas
    };

    const txHash: string = await (window as any).ethereum.request({
      method: "eth_sendTransaction",
      params: [txParams],
    });

    // Wait for confirmation (optional: using ethers.js could give receipt)
    if (toast) {
      toast({
        title: "Transaction sent",
        description: `Tx hash: ${txHash.slice(0, 10)}...`,
      });
    }

    // Persist in Supabase
    if (userId) {
      await supabase.from("registrations").insert({
        user_id: userId,
        wallet: from,
        unique_id: uniqueIdHex,
        tx_hash: txHash,
      });
    }

    return txHash;
  } catch (err: any) {
    throw new Error("Blockchain transaction failed: " + (err.message || err));
  }
}
