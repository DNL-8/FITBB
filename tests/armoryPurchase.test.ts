import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleEquipGear, handlePurchaseGear } from '../src/server/apiV1/domain.ts';
import { ApiHttpError, firestoreRest, type VerifiedFirebaseUser } from '../src/server/firebaseRest.ts';
import { createInitialGameStats, DEFAULT_OWNED_EQUIPMENT_IDS } from '../src/utils/rpgLogic.ts';

test('comprar e equipar preservam dados antigos e cobram apenas uma vez em tentativas simultâneas', async (t) => {
  const user: VerifiedFirebaseUser = {
    uid: 'armory-owner', token: 'fixture', email: null, emailVerified: true, isAdmin: false,
  };
  const { ownedEquipmentIds, equippedGear, ...legacyStats } = createInitialGameStats(user.uid);
  const stored: Record<string, unknown> = { ...legacyStats, legacyMarker: true };
  let version = 1;
  const purchases: Record<string, unknown>[] = [];
  t.mock.method(firestoreRest, 'getDoc', async () => ({ userId: user.uid }));
  t.mock.method(firestoreRest, 'getDocWithMeta', async () => ({
    data: { ...stored }, updateTime: String(version),
  }));
  t.mock.method(firestoreRest, 'commitWrites', async (
    _token: string, writes: Parameters<typeof firestoreRest.commitWrites>[1]
  ) => {
    const [write, ledgerWrite] = writes;
    assert.equal(write.type, 'patch');
    assert.equal(write.path, `users/${user.uid}/gameStats/main`);
    if (write.precondition?.updateTime !== String(version)) {
      throw new ApiHttpError(409, 'Conflito de atualização.', 'concurrency_conflict');
    }
    if (ledgerWrite) {
      assert.equal(ledgerWrite.type, 'set');
      assert.match(ledgerWrite.path, /\/progressLedger\//);
      assert.deepEqual(ledgerWrite.precondition, { exists: false });
      purchases.push(ledgerWrite.data);
    }
    Object.assign(stored, write.data);
    version += 1;
  });

  const itemId = 'arma_faca_incursao_f';
  const purchase = () => handlePurchaseGear(user, { itemId, equip: true });
  const results = await Promise.all([purchase(), purchase()]);
  for (const result of results) {
    assert.equal(result.goldCoins, 25);
    assert.equal(result.equippedGear.arma, itemId);
    assert.deepEqual(result.ownedEquipmentIds, [...DEFAULT_OWNED_EQUIPMENT_IDS, itemId]);
  }
  assert.equal(stored.goldCoins, 25);
  assert.equal(stored.totalCoinsEarned, 50);
  assert.deepEqual(stored.ownedEquipmentIds, [itemId]);
  assert.equal(stored.legacyMarker, true);

  await assert.rejects(
    handlePurchaseGear(user, { itemId: 'arma_espada_ferro_jin' }),
    { code: 'insufficient_coins' }
  );
  const result = await handleEquipGear(user, { slot: 'arma', itemId: null });
  assert.equal(result.equippedGear.arma, null);
  assert.equal(stored.goldCoins, 25);
  assert.equal(stored.legacyMarker, true);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].kind, 'armory_purchase');
  assert.equal(purchases[0].title, results[0].purchasedItem.name);
  assert.equal(purchases[0].xpDelta, 0);
  assert.equal(purchases[0].coinDelta, -25);
  assert.equal(purchases[0].goldCoins, 25);
});
