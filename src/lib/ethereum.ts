// src/lib/ethereum.ts
import { REGISTRY_ADDRESS, SEPOLIA_EXPLORER_TX } from "./constants";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* 1️⃣  Get the first MetaMask account                                */
export async function getEthereumAccount(): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask not installed");
  const accounts: string[] = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  return accounts[0];
}

/* ------------------------------------------------------------------ */
/* 2️⃣  Build a deterministic 64‑hex ID                               */
export async function generateUniqueId(address: string): Promise<string> {
  const encoder = new TextEncoder();
  const text = `${address}-${Date.now()}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* 3️⃣  ABI‑encode calldata for `register(string calldata uniqueId)` */
function encodeRegisterUniqueId(uniqueId: string): string {
  //  selector for register(string)
  const selector = "b63a0b30";

  // offset to the string data = 32 bytes = 0x20
  const offset = "0000000000000000000000000000000000000000000000000000000000000020";

  // Encode the string itself
  const encoder = new TextEncoder();
  const bytes = encoder.encode(uniqueId);
  const lenHex = bytes.length.toString(16).padStart(64, "0");

  // Pad the string bytes to 32‑byte alignment
  let dataHex = "";
  for (const b of bytes) dataHex += b.toString(16).padStart(2, "0");
  dataHex = dataHex.padEnd(64, "0");

  // Final calldata
  return selector + offset + lenHex + dataHex;
}

/* ------------------------------------------------------------------ */
/* 4️⃣  Send the transaction *and* persist the tx hash in Supabase     */
export async function registerOnChainAndPersist(
  uniqueId: string,
  userId: string,
  toast: ReturnType<typeof useToast>["toast"]
) {
  if (!window.ethereum) throw new Error("MetaMask not installed");

  const address = await getEthereumAccount();
  const calldata = encodeRegisterUniqueId(uniqueId);

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

  // Persist tx hash to the profile row
  const { error } = await supabase
    .from("profiles")
    .update({ registration_tx: txHash })
    .eq("id", userId);

  if (error) throw error;

  // Notify user (plain string – no JSX)
  toast({
    title: "Transaction submitted",
    description: `View it on Etherscan: ${SEPOLIA_EXPLORER_TX}${txHash}`,
  });

  return txHash;
}
