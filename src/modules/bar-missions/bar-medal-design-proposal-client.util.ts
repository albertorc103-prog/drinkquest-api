/** Propuestas visibles en BAR/ADMIN principal tras confirmar selección (solo la elegida). */
export function filterDesignProposalsForClientView<
  T extends { id: string; position: number; imageUrl: string },
>(
  proposals: T[],
  version: {
    designSelectionConfirmedAt: Date | null;
    selectedProposalId: string | null;
  },
  includeAudit: boolean,
): T[] {
  if (includeAudit) return proposals;
  if (!version.designSelectionConfirmedAt || !version.selectedProposalId) {
    return proposals;
  }
  const selected = proposals.filter((p) => p.id === version.selectedProposalId);
  if (selected.length > 0) return selected;
  return proposals.slice(0, 0);
}
