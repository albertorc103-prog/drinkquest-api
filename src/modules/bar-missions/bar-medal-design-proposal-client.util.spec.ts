import { filterDesignProposalsForClientView } from './bar-medal-design-proposal-client.util';

describe('filterDesignProposalsForClientView', () => {
  const proposals = [
    { id: 'a', position: 1, imageUrl: '1' },
    { id: 'b', position: 2, imageUrl: '2' },
    { id: 'c', position: 3, imageUrl: '3' },
  ];

  it('sin confirmación devuelve todas', () => {
    expect(
      filterDesignProposalsForClientView(
        proposals,
        { designSelectionConfirmedAt: null, selectedProposalId: null },
        false,
      ),
    ).toHaveLength(3);
  });

  it('tras confirmación solo la elegida', () => {
    const filtered = filterDesignProposalsForClientView(
      proposals,
      {
        designSelectionConfirmedAt: new Date(),
        selectedProposalId: 'b',
      },
      false,
    );
    expect(filtered).toEqual([{ id: 'b', position: 2, imageUrl: '2' }]);
  });

  it('audit=1 devuelve todas', () => {
    expect(
      filterDesignProposalsForClientView(
        proposals,
        {
          designSelectionConfirmedAt: new Date(),
          selectedProposalId: 'b',
        },
        true,
      ),
    ).toHaveLength(3);
  });
});
