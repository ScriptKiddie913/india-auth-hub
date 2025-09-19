// src/lib/ethereum.ts
import { supabase } from "@/integrations/supabase/client";

/* ---------------- Contract config ---------------- */
const CONTRACT_ADDRESS = "0x0d0A38A501B2AD98248eD7E17b6025D9a55F5044"; // replace if redeployed
// Function selector for register(bytes32)
const REGISTER_SELECTOR = "0x2f2ff15d";

/* ---------------- Ethereum helpers ---------------- */
export async function getEthereumAccount(): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");

  const accounts: string[] = await (window as any).ethereum.request({
    method: "eth_requestAccounts",
  });

  return accounts[0];
}

export function generateUniqueId(): string {
  // Random 32-byte hex string
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "0x" + Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function registerOnChainAndPersist(uniqueIdHex: string, userId?: string, toast?: any) {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");

  const from = await getEthereumAccount();

  // Build calldata: selector + 32-byte uniqueId
  const data = REGISTER_SELECTOR + uniqueIdHex.slice(2).padEnd(64, "0");

  // Send tx via MetaMask
  const txHash: string = await (window as any).ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: CONTRACT_ADDRESS,
        data,
      },
    ],
  });

  // Save in Supabase (optional)
  if (userId) {
    await supabase.from("registrations").insert({
      user_id: userId,
      wallet: from,
      unique_id: uniqueIdHex,
      tx_hash: txHash,
    });
  }

  if (toast) {
    toast({
      title: "On-chain registration sent",
      description: `Tx hash: ${txHash.slice(0, 10)}...`,
    });
  }

  return txHash;
}

