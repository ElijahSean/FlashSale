import { purchaseResponse } from './purchase-result';
import { PURCHASE_RESULTS } from './purchase.service';

describe('purchaseResponse (result to HTTP, docs/design-rules.md table)', () => {
  it.each([
    ['SUCCESS', 201],
    ['ALREADY_PURCHASED', 409],
    ['SOLD_OUT', 410],
    ['NOT_STARTED', 403],
    ['ENDED', 403],
  ] as const)('%s answers %i', (result, status) => {
    expect(purchaseResponse(result).status).toBe(status);
  });

  it('always names the result in the body, so the web app can tell NOT_STARTED from ENDED', () => {
    for (const result of PURCHASE_RESULTS) {
      const { status, body } = purchaseResponse(result);
      expect(body).toMatchObject({ statusCode: status, result });
      expect(typeof body.message).toBe('string');
    }
  });
});
