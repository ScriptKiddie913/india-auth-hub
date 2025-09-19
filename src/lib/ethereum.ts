// src/lib/ethereum.ts
import { REGISTRY_ADDRESS, SEPOLIA_EXPLORER_TX } from "./constants";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * 1️⃣ Returns the first address that MetaMask gives us
 */
export async function getEthereumAccount(): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask not installed");
  const accounts: string[] = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  return accounts[0];
}

/**
 * 2️⃣ Create a deterministic 64‑hex ID: SHA‑256([addr]-[ts])
 */
export async function generateUniqueId(address: string): Promise<string> {
  const encoder = new TextEncoder();
  const text = `${address}-${Date.now()}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 3️⃣ ABI‑encode the calldata for `register(string calldata uniqueId)`
 *     *NO* external libraries – pure JavaScript.
 */
function encodeRegisterUniqueId(uniqueId: string): string {
  // selector for function register(string)
  const selector = "b63a0b30";

  // offset to the start of the string data – always 32 (0x20)
  const offset = "0000000000000000000000000000000000000000000000000000000000000020";

  // encode the string itself
  const encoder = new TextEncoder();
  const bytes = encoder.encode(uniqueId);
  const lenHex = bytes.length.toString(16).padStart(64, "0");

  // pad the string bytes to a multiple of 32 bytes
  let dataHex = "";
  for (const b of bytes) dataHex += b.toString(16).padStart(2, "0");
  dataHex = dataHex.padEnd(64, "0");

  // final calldata = selector + offset + len + data
  return selector + offset + lenHex + dataHex;
}

/**
 * 4️⃣ Send the transaction that calls the Registry contract,
 *     then persist the tx hash in the user’s profile row
 */
export async function registerOnChainAndPersist(
  uniqueId: string,
  userId: string,
  toast: ReturnType<typeof useToast>["toast"]
) {
  if (!window.ethereum) throw new Error("MetaMask not installed");

  const address = await getEthereumAccount();
  const calldata = encodeRegisterUniqueId(uniqueId);

  // Send the transaction to the contract
  const txHash: string = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: address,
        to: REGISTRY_ADDRESS,
        data: "0x" + calldata,
      },
    ],
  });

  // Persist the hash so you can later look it up
  const { error } = await supabase
    .from("profiles")
    .update({ registration_tx: txHash })
    .eq("id", userId);

  if (error) throw error;

  // Tell the user how to view the block
  toast({
    title: "Transaction submitted",
    description: (
      <span>
        View it on <a href={`${SEPOLIA_EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">Etherscan</a>
      </span>
    ),
  });

  return txHash;
}
