/* =======================================================
   ethereum.ts – blockchain helpers
   -------------------------------------------------------
   Network: Sepolia ETH (MetaMask injected provider)
   Contract: Registry.sol (bytes32 uniqueId)
   ======================================================= */

import { ethers } from "ethers";
import { supabase } from "@/integrations/supabase/client";
import type { Toast } from "@/hooks/use-toast";

/* ---------------- Contract config ---------------- */
const CONTRACT_ADDRESS = "0xYOUR_CONTRACT_ADDRESS"; // <-- replace
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "uniqueId", type: "bytes32" }],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "walletToId",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "idToWallet",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "wallet", type: "address" },
      { indexed: true, internalType: "bytes32", name: "uniqueId", type: "bytes32" },
    ],
    name: "Registered",
    type: "event",
  },
];

/* ---------------- Wallet helpers ---------------- */
export async function getEthereumAccount(): Promise<string> {
  if (!(window as any).ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }

  const provider = new ethers.BrowserProvider((window as any).ethereum);

  // Request accounts
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return signer.getAddress();
}

/* ---------------- ID generator (bytes32) ---------------- */
export async function generateUniqueId(walletAddress: string): Promise<string> {
  // Keccak256 hash of wallet + timestamp → bytes32 string
  return ethers.keccak256(
    ethers.toUtf8Bytes(walletAddress + Date.now().toString())
  );
}

/* ---------------- On-chain registration ---------------- */
export async function registerOnChainAndPersist(
  uniqueId: string, // already bytes32 string
  userId: string,
  toast: Toast["toast"]
) {
  if (!(window as any).ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }

  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  try {
    // Call contract register(uniqueId)
    const tx = await contract.register(uniqueId);
    toast({
      title: "Transaction sent",
      description: `Tx hash: ${tx.hash.slice(0, 10)}...`,
    });

    // Wait for confirmation
    await tx.wait();

    // Persist tx hash in Supabase
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      unique_id: uniqueId,
      tx_hash: tx.hash,
      network: "sepolia",
    });

    if (error) throw error;

    toast({
      title: "Transaction confirmed",
      description: "Your profile is now on-chain ✅",
    });

    return tx;
  } catch (err: any) {
    console.error(err);
    throw new Error(err.message || "Failed to register on-chain");
  }
}
