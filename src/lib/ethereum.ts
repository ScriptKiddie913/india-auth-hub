import { ethers } from "ethers";
import { supabase } from "@/integrations/supabase/client";
import { Toast } from "@/hooks/use-toast";

/* Contract ABI (from your Registry.sol) */
const registryAbi = [
  "function register(bytes32 uniqueId) external",
  "event Registered(address indexed wallet, bytes32 indexed uniqueId)",
];

/* ✅ replace with your deployed Registry contract address */
const registryAddress = "0x0d0A38A501B2AD98248eD7E17b6025D9a55F5044";

/**
 * Connect to MetaMask and return the first account
 */
export async function getEthereumAccount(): Promise<string> {
  if (!(window as any).ethereum) {
    throw new Error("MetaMask not detected");
  }
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return signer.address;
}

/**
 * Generate a deterministic 32-byte ID from wallet + timestamp
 */
export function generateUniqueId(wallet: string): string {
  const hash = ethers.keccak256(
    ethers.toUtf8Bytes(wallet + Date.now().toString())
  );
  return hash; // 0x… 64 hex chars
}

/**
 * Call the Registry contract and persist txHash in Supabase
 */
export async function registerOnChainAndPersist(
  uniqueId: string,
  userId: string,
  toast: Toast
) {
  if (!(window as any).ethereum) {
    throw new Error("MetaMask not detected");
  }

  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(registryAddress, registryAbi, signer);

  try {
    const tx = await contract.register(uniqueId);
    toast({
      title: "Transaction sent",
      description: `Tx hash: ${tx.hash}`,
    });

    const receipt = await tx.wait();

    // Save txHash in Supabase
    const { error } = await supabase.from("profiles").update({
      tx_hash: tx.hash,
    }).eq("user_id", userId);

    if (error) {
      console.error("Supabase update error:", error);
    }

    toast({
      title: "Transaction confirmed",
      description: `View on Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`,
    });

    return receipt;
  } catch (err: any) {
    console.error("Contract call failed:", err);
    throw new Error(err.message || "On-chain registration failed");
  }
}
