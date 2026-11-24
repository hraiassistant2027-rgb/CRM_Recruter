import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/google', () => ({ googleFetch: vi.fn() }));

const { buildQuery, folderIdFromLink, q } = await import('./drive');

describe('банк резюме: пошук на Google Диску', () => {
  it('посилання на папку -> ідентифікатор', () => {
    expect(folderIdFromLink('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing')).toBe('1AbCdEfGhIjKlMnOp');
    expect(folderIdFromLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(folderIdFromLink('не посилання')).toBeNull();
  });
  it('лапки в запиті екрануються', () => {
    expect(q("кам'янське")).toBe("'кам\\'янське'");
  });
  it('фільтри перетворюються на запит Диска', () => {
    const query = buildQuery({ text: '', position: 'прораб', city: 'Київ', skills: 'AutoCAD, кошторис', name: '', type: 'pdf', since: '2024-01-01', until: '' });
    expect(query).toContain("fullText contains 'прораб'");
    expect(query).toContain("fullText contains 'Київ'");
    expect(query).toContain("fullText contains 'AutoCAD'");
    expect(query).toContain("fullText contains 'кошторис'");
    expect(query).toContain("mimeType = 'application/pdf'");
    expect(query).toContain("modifiedTime >= '2024-01-01T00:00:00'");
  });
});
