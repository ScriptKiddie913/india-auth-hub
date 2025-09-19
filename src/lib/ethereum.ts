import { ethers } from "ethers";

// Replace with your deployed Registry address + ABI
const CONTRACT_ADDRESS = "0xYourRegistryAddress";
const CONTRACT_ABI = [
  "function register(bytes32 uniqueId) external",
  "function walletToId(address) view returns (bytes32)"
];

export async function getEthereumAccount(): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
  return account;
}

export async function generateUniqueId(address: string): Promise<string> {
  // A simple hash from address + timestamp
  const hash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(address + Date.now().toString())
  );
  return hash;
}

export async function registerOnChainAndPersist(
  uniqueId: string,
  userId: string,
  toast: any
) {
  if (!window.ethereum) throw new Error("MetaMask not installed");

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // Convert uniqueId (hex string) → bytes32
  const tx = await contract.register(uniqueId);
  await tx.wait();

  // Example: store tx hash in Supabase (optional)
  // await supabase.from("onchain_logs").insert({ user_id: userId, tx_hash: tx.hash });

  toast({
    title: "On-chain registration complete",
    description: (
      <a
        href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        View transaction
      </a>
    ),
  });
}
