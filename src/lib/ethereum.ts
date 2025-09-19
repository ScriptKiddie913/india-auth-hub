export async function registerOnChainAndPersist(
  uniqueIdHex: string,
  userId?: string,
  toast?: any
) {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");

  const from = await getEthereumAccount();

  // Ensure bytes32 is 32 bytes left-padded
  const calldata = REGISTER_SELECTOR + uniqueIdHex.slice(2).padStart(64, "0");

  try {
    // Send transaction via MetaMask
    const txParams: any = {
      from,
      to: CONTRACT_ADDRESS,
      data: calldata,
      // optional: specify gas limit (try 100000)
      gas: "0x186A0", // 100000 in hex
    };

    const txHash: string = await (window as any).ethereum.request({
      method: "eth_sendTransaction",
      params: [txParams],
    });

    // Store in Supabase
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
  } catch (err: any) {
    throw new Error("Blockchain transaction failed: " + err.message);
  }
}


