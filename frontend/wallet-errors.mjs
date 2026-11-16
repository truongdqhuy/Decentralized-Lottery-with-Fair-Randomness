// ethers may wrap the useful MetaMask/RPC message in info.error.
export function walletErrorMessage(error) {
  const nested = [error?.info?.error?.data?.originalError, error?.info?.error,
    error?.error?.data?.originalError, error?.error, error].filter(Boolean);
  const hasCode = code => nested.some(e => Number(e.code) === code);
  if (hasCode(-32002)) return 'MetaMask already has a pending request. Open the MetaMask extension and complete or reject that request, then click Connect again.';
  if (hasCode(4001) || error?.code === 'ACTION_REJECTED') return 'Request cancelled in MetaMask. Click the button again when you are ready.';
  if (hasCode(4100)) return 'MetaMask has not authorized this account. Open MetaMask, connect this site to your Ganache account, then try again.';
  if (error?.code === 'INSUFFICIENT_FUNDS') return 'This account needs Ganache test ETH for the payment and gas. Select a funded Ganache account in MetaMask.';
  const detail = nested.map(e => e.reason || e.message).find(m =>
    typeof m === 'string' && !m.includes('could not coalesce error'));
  return detail || error?.shortMessage || 'Wallet request failed. Open MetaMask and check its pending requests and Ganache network settings.';
}
