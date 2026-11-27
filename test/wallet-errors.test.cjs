const assert = require('node:assert/strict');

describe('wallet error messages', function () {
  let walletErrorMessage;

  before(async function () {
    ({ walletErrorMessage } = await import('../frontend/wallet-errors.mjs'));
  });

  it('prefers the decoded contract revert over Ganache’s generic wrapper', function () {
    const error = {
      reason: 'Round active',
      info: { error: { message: 'Internal JSON-RPC error.' } }
    };

    assert.equal(walletErrorMessage(error), 'Round active');
  });

  it('explains common round-opening requirements when the RPC error is generic', function () {
    const message = walletErrorMessage({
      info: { error: { message: 'Internal JSON-RPC error.' } }
    });

    assert.match(message, /deployment owner/);
    assert.match(message, /no round is active/);
    assert.match(message, /at least 30 seconds/);
  });

  it('preserves the pending MetaMask request guidance', function () {
    assert.match(walletErrorMessage({ code: -32002 }), /pending request/);
  });
});
