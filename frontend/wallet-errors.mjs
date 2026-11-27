// ethers may wrap the useful MetaMask/RPC message in info.error.
export function walletErrorMessage(error) {
  const nested = [error?.info?.error?.data?.originalError, error?.info?.error,
    error?.error?.data?.originalError, error?.error, error].filter(Boolean);
  const hasCode = code => nested.some(e => Number(e.code) === code);
  if (hasCode(-32002)) return 'MetaMask already has a pending request. Open the MetaMask extension and complete or reject that request, then click Connect again.';
  if (hasCode(4001) || error?.code === 'ACTION_REJECTED') return 'Request cancelled in MetaMask. Click the button again when you are ready.';
  if (hasCode(4100)) return 'MetaMask has not authorized this account. Open MetaMask, connect this site to your Ganache account, then try again.';
  if (error?.code === 'INSUFFICIENT_FUNDS') return 'This account needs Ganache test ETH for the payment and gas. Select a funded Ganache account in MetaMask.';
  const details = [
    error?.reason, ...nested.map(e => e.reason),
    error?.shortMessage, ...nested.map(e => e.shortMessage),
    ...nested.map(e => e.message), error?.message
  ];
  const detail = details.find(m => typeof m === 'string' &&
    !/^internal json-rpc error\.?$/i.test(m.trim()) &&
    !/^could not coalesce error/i.test(m.trim()));
  return detail || 'Ganache returned an internal JSON-RPC error. Check that Ganache is running and MetaMask is on the configured chain. To open a round, use the deployment owner, make sure no round is active, and set both windows to at least 30 seconds.';
}
