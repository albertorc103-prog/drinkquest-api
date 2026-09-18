import {
  collectionKey,
  resolvePlaceIdentity,
} from './place-visit.identity';

describe('place-visit.identity', () => {
  it('prioriza googlePlaceId sobre barId', () => {
    expect(
      resolvePlaceIdentity({
        googlePlaceId: 'ABC123',
        barId: 'uuid-bar',
      }),
    ).toEqual({ kind: 'google', googlePlaceId: 'ABC123' });
  });

  it('usa barId solo sin googlePlaceId', () => {
    expect(resolvePlaceIdentity({ barId: 'uuid-bar' })).toEqual({
      kind: 'bar',
      barId: 'uuid-bar',
    });
  });

  it('collectionKey unifica External y Bar por googlePlaceId', () => {
    const a = collectionKey({ googlePlaceId: 'ABC123', barId: null });
    const b = collectionKey({ googlePlaceId: 'ABC123', barId: 'uuid-bar' });
    expect(a).toBe('g:ABC123');
    expect(b).toBe('g:ABC123');
    expect(a).toBe(b);
  });
});
