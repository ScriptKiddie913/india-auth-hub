// src/lib/ethereum.ts
import { supabase } from "@/integrations/supabase/client";

/* ---------------- Contract config ---------------- */
export const CONTRACT_ADDRESS = "0x0d0A38A501B2AD98248eD7E17b6025D9a55F5044";
export const CONTRACT_ABI = [
  "function register(bytes32 uniqueId) external",
  "event Registered(address indexed wallet, bytes32 indexed uniqueId)",
];

/* ---------------- Ethereum helpers ---------------- */
export async function getEthereumAccount(): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");
  const accounts: string[] = await (window as any).ethereum.request({
    method: "eth_requestAccounts",
  });
  return accounts[0];
}

// Generate a random 32-byte hex string
export function generateUniqueId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "0x" + Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Register on chain and save in Supabase
export async function registerOnChainAndPersist(
  uniqueIdHex: string,
  userId?: string,
  toast?: any
) {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");

  const from = await getEthereumAccount();

  // Use ethers from CDN
  const provider = new (window as any).ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new (window as any).ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // Send transaction
  const tx = await contract.register(uniqueIdHex);
  const receipt = await tx.wait();

  // Save registration in Supabase
  if (userId) {
    await supabase.from("registrations").insert({
      user_id: userId,
      wallet: from,
      unique_id: uniqueIdHex,
      tx_hash: tx.hash,
    });
  }

  if (toast) {
    toast({
      title: "On-chain registration sent",
      description: `Tx hash: ${tx.hash.slice(0, 10)}...`,
    });
  }

  return tx.hash;
}
